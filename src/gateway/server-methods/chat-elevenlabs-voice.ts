import { readConfigFileSnapshot } from "../../config/config.js";
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
const CHAT_ELEVENLABS_VOICE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_ELEVENLABS_VOICE_ACCEPTED_MIME_TYPES = [
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

function isAcceptedChatElevenLabsVoiceMimeType(
  value: unknown,
): value is (typeof CHAT_ELEVENLABS_VOICE_ACCEPTED_MIME_TYPES)[number] {
  const normalized = normalizeMimeType(value);
  return (
    normalized !== undefined &&
    (CHAT_ELEVENLABS_VOICE_ACCEPTED_MIME_TYPES as readonly string[]).includes(normalized)
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

export const chatElevenLabsVoiceHandlers: GatewayRequestHandlers = {
  "chat.voice.elevenlabs.status": async ({ respond }) => {
    const apiKey = await resolveElevenLabsApiKey();
    respond(
      true,
      {
        enabled: Boolean(apiKey),
        acceptedMimeTypes: [...CHAT_ELEVENLABS_VOICE_ACCEPTED_MIME_TYPES],
        maxBytes: CHAT_ELEVENLABS_VOICE_MAX_BYTES,
      },
      undefined,
    );
  },
  "chat.voice.elevenlabs.transcribe": async ({ params, respond }) => {
    if (!validateChatVoiceTranscribeParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid chat.voice.elevenlabs.transcribe params: ${formatValidationErrors(validateChatVoiceTranscribeParams.errors)}`,
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
    if (!mimeType || !isAcceptedChatElevenLabsVoiceMimeType(mimeType)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "unsupported audio MIME type"),
      );
      return;
    }

    const apiKey = await resolveElevenLabsApiKey();
    if (!apiKey) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "elevenlabs voice transcription unavailable: configure ELEVENLABS_API_KEY or talk.providers.elevenlabs.apiKey",
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
    if (audioBuffer.byteLength > CHAT_ELEVENLABS_VOICE_MAX_BYTES) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `audio payload exceeds ${CHAT_ELEVENLABS_VOICE_MAX_BYTES} bytes`,
        ),
      );
      return;
    }

    const fileName =
      (typeof p.fileName === "string" && p.fileName.trim()) ||
      `elevenlabs-voice-input${inferAudioExtension(mimeType)}`;

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
          "xi-api-key": apiKey,
        },
        body: formData,
      });
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "elevenlabs voice transcription request failed"),
      );
      return;
    }

    if (!transcriptionResponse.ok) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `elevenlabs voice transcription failed (${transcriptionResponse.status})`,
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
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "elevenlabs voice transcription returned an empty transcript",
        ),
      );
      return;
    }

    respond(true, { text }, undefined);
  },
};
