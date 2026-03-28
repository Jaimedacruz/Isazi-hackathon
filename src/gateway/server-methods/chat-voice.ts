import { readConfigFileSnapshot } from "../../config/config.js";
import { transcribeOpenAiCompatibleAudio } from "../../media-understanding/openai-compatible-audio.js";
import { OPENAI_DEFAULT_AUDIO_TRANSCRIPTION_MODEL } from "../../plugins/provider-model-defaults.js";
import { resolveConfiguredSecretInputWithFallback } from "../resolve-configured-secret-input-string.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateChatVoiceTranscribeParams,
} from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

const ELEVENLABS_STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const ELEVENLABS_STT_MODEL_ID = "scribe_v2";
const OPENAI_STT_ENDPOINT = "https://api.openai.com/v1";
const CHAT_VOICE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_VOICE_REQUEST_TIMEOUT_MS = 30_000;
const CHAT_VOICE_ACCEPTED_MIME_TYPES = [
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
] as const;

function normalizeMimeType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.split(";", 1)[0];
}

function isAcceptedChatVoiceMimeType(
  value: unknown,
): value is (typeof CHAT_VOICE_ACCEPTED_MIME_TYPES)[number] {
  const normalized = normalizeMimeType(value);
  return (
    normalized !== undefined &&
    (CHAT_VOICE_ACCEPTED_MIME_TYPES as readonly string[]).includes(normalized)
  );
}

function inferAudioExtension(mimeType: string): string {
  switch (mimeType) {
    case "audio/mp4":
      return ".m4a";
    case "audio/mpeg":
      return ".mp3";
    case "audio/ogg":
      return ".ogg";
    case "audio/wav":
      return ".wav";
    case "audio/webm":
      return ".webm";
    default:
      return ".bin";
  }
}

async function resolveElevenLabsApiKey(): Promise<string | undefined> {
  const snapshot = await readConfigFileSnapshot();
  const talk = snapshot.config.talk;
  const providerApiKey = talk?.providers?.elevenlabs?.apiKey;
  const legacyApiKey = talk?.apiKey;
  const resolved = await resolveConfiguredSecretInputWithFallback({
    config: snapshot.config,
    env: process.env,
    value: providerApiKey ?? legacyApiKey,
    path: providerApiKey == null ? "talk.apiKey" : "talk.providers.elevenlabs.apiKey",
    readFallback: () => {
      const envValue = process.env.ELEVENLABS_API_KEY?.trim();
      return envValue ? envValue : undefined;
    },
  });
  return resolved.value;
}

async function resolveOpenAiApiKey(): Promise<string | undefined> {
  const snapshot = await readConfigFileSnapshot();
  const config = snapshot.config;
  const talkProviderApiKey = config.talk?.providers?.openai?.apiKey;
  const modelProviderApiKey = config.models?.providers?.openai?.apiKey;
  const resolved = await resolveConfiguredSecretInputWithFallback({
    config,
    env: process.env,
    value: talkProviderApiKey ?? modelProviderApiKey,
    path:
      talkProviderApiKey != null
        ? "talk.providers.openai.apiKey"
        : "models.providers.openai.apiKey",
    readFallback: () => {
      const envValue = process.env.OPENAI_API_KEY?.trim();
      return envValue ? envValue : undefined;
    },
  });
  return resolved.value;
}

type ChatVoiceProvider =
  | { kind: "openai"; apiKey: string }
  | { kind: "elevenlabs"; apiKey: string };

async function resolveChatVoiceProvider(): Promise<ChatVoiceProvider | null> {
  const openAiApiKey = await resolveOpenAiApiKey();
  if (openAiApiKey) {
    return { kind: "openai", apiKey: openAiApiKey };
  }
  const elevenLabsApiKey = await resolveElevenLabsApiKey();
  if (elevenLabsApiKey) {
    return { kind: "elevenlabs", apiKey: elevenLabsApiKey };
  }
  return null;
}

export const chatVoiceHandlers: GatewayRequestHandlers = {
  "chat.voice.status": async ({ respond }) => {
    const provider = await resolveChatVoiceProvider();
    respond(
      true,
      {
        enabled: Boolean(provider),
        acceptedMimeTypes: [...CHAT_VOICE_ACCEPTED_MIME_TYPES],
        maxBytes: CHAT_VOICE_MAX_BYTES,
      },
      undefined,
    );
  },
  "chat.voice.transcribe": async ({ params, respond }) => {
    if (!validateChatVoiceTranscribeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.voice.transcribe params: ${formatValidationErrors(validateChatVoiceTranscribeParams.errors)}`,
        ),
      );
      return;
    }

    const p = params as {
      mimeType: string;
      audioBase64: string;
      fileName?: string;
    };
    const mimeType = normalizeMimeType(p.mimeType);
    if (!mimeType || !isAcceptedChatVoiceMimeType(mimeType)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "unsupported audio MIME type"),
      );
      return;
    }

    const provider = await resolveChatVoiceProvider();
    if (!provider) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "voice transcription unavailable: configure OPENAI_API_KEY/models.providers.openai.apiKey or ELEVENLABS_API_KEY/talk.providers.elevenlabs.apiKey",
        ),
      );
      return;
    }

    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(p.audioBase64, "base64");
    } catch {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid audio payload"));
      return;
    }
    if (audioBuffer.byteLength === 0) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "audio payload is empty"));
      return;
    }
    if (audioBuffer.byteLength > CHAT_VOICE_MAX_BYTES) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `audio payload exceeds ${CHAT_VOICE_MAX_BYTES} bytes`,
        ),
      );
      return;
    }

    const fileName =
      (typeof p.fileName === "string" && p.fileName.trim()) ||
      `voice-input${inferAudioExtension(mimeType)}`;

    if (provider.kind === "openai") {
      try {
        const result = await transcribeOpenAiCompatibleAudio({
          apiKey: provider.apiKey,
          buffer: audioBuffer,
          mime: mimeType,
          fileName,
          defaultBaseUrl: OPENAI_STT_ENDPOINT,
          defaultModel: OPENAI_DEFAULT_AUDIO_TRANSCRIPTION_MODEL,
          timeoutMs: CHAT_VOICE_REQUEST_TIMEOUT_MS,
        });
        respond(true, { text: result.text }, undefined);
      } catch {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "voice transcription request failed"),
        );
      }
      return;
    }

    const formData = new FormData();
    formData.set(
      "file",
      new File([audioBuffer], fileName, {
        type: mimeType,
      }),
    );
    formData.set("model_id", ELEVENLABS_STT_MODEL_ID);

    let transcriptionResponse: Response;
    try {
      transcriptionResponse = await fetch(ELEVENLABS_STT_ENDPOINT, {
        method: "POST",
        headers: {
          "xi-api-key": provider.apiKey,
        },
        body: formData,
      });
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "voice transcription request failed"),
      );
      return;
    }

    if (!transcriptionResponse.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `voice transcription failed (${transcriptionResponse.status})`,
        ),
      );
      return;
    }

    const payload = (await transcriptionResponse.json()) as {
      text?: unknown;
      transcript?: unknown;
    };
    const text =
      (typeof payload.text === "string" && payload.text.trim()) ||
      (typeof payload.transcript === "string" && payload.transcript.trim()) ||
      "";
    if (!text) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "voice transcription returned an empty transcript"),
      );
      return;
    }

    respond(true, { text }, undefined);
  },
};
