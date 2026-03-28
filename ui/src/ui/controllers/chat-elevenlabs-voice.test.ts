import { describe, expect, it, vi } from "vitest";
import {
  loadChatElevenLabsVoiceStatus,
  transcribeChatElevenLabsVoice,
  type ChatElevenLabsVoiceStatus,
} from "./chat-elevenlabs-voice.ts";

describe("loadChatElevenLabsVoiceStatus", () => {
  it("requests the gateway ElevenLabs voice status", async () => {
    const status: ChatElevenLabsVoiceStatus = {
      enabled: true,
      acceptedMimeTypes: ["audio/webm"],
      maxBytes: 1024,
    };
    const client = {
      request: vi.fn().mockResolvedValue(status),
    };

    await expect(loadChatElevenLabsVoiceStatus(client as never)).resolves.toEqual(status);
    expect(client.request).toHaveBeenCalledWith("chat.voice.elevenlabs.status");
  });
});

describe("transcribeChatElevenLabsVoice", () => {
  it("uploads a base64-encoded blob to the ElevenLabs gateway method", async () => {
    const client = {
      request: vi.fn().mockResolvedValue({ text: "hello from elevenlabs" }),
    };
    const blob = new Blob(["voice"], { type: "audio/webm" });

    await expect(
      transcribeChatElevenLabsVoice({
        client: client as never,
        blob,
      }),
    ).resolves.toBe("hello from elevenlabs");

    expect(client.request).toHaveBeenCalledWith("chat.voice.elevenlabs.transcribe", {
      mimeType: "audio/webm",
      audioBase64: "dm9pY2U=",
      fileName: "elevenlabs-voice-input.webm",
    });
  });
});
