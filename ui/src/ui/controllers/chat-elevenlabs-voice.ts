import type { GatewayBrowserClient } from "../gateway.ts";

export type ChatElevenLabsVoiceStatus = {
  enabled: boolean;
  acceptedMimeTypes: string[];
  maxBytes: number;
};

function inferAudioExtension(mimeType: string): string {
  switch (mimeType.trim().toLowerCase().split(";", 1)[0]) {
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function loadChatElevenLabsVoiceStatus(
  client: GatewayBrowserClient,
): Promise<ChatElevenLabsVoiceStatus> {
  return await client.request<ChatElevenLabsVoiceStatus>("chat.voice.elevenlabs.status");
}

export async function transcribeChatElevenLabsVoice(params: {
  client: GatewayBrowserClient;
  blob: Blob;
  mimeType?: string;
}): Promise<string> {
  const mimeType = (params.mimeType ?? params.blob.type ?? "").trim();
  if (!mimeType) {
    throw new Error("Recorded ElevenLabs audio is missing a MIME type.");
  }
  const audioBase64 = arrayBufferToBase64(await params.blob.arrayBuffer());
  const response = await params.client.request<{ text: string }>(
    "chat.voice.elevenlabs.transcribe",
    {
      mimeType,
      audioBase64,
      fileName: `elevenlabs-voice-input${inferAudioExtension(mimeType)}`,
    },
  );
  return response.text;
}
