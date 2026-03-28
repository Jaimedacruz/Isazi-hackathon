import { describe, expect, it, vi } from "vitest";
import {
  loadChatVoiceStatus,
  transcribeChatVoice,
  type ChatVoiceStatus,
} from "./chat-voice.ts";

describe("loadChatVoiceStatus", () => {
  it("requests the gateway voice status", async () => {
    const status: ChatVoiceStatus = {
      enabled: true,
      acceptedMimeTypes: ["audio/webm"],
      maxBytes: 1024,
    };
    const client = {
      request: vi.fn().mockResolvedValue(status),
    };

    await expect(loadChatVoiceStatus(client as never)).resolves.toEqual(status);
    expect(client.request).toHaveBeenCalledWith("chat.voice.status");
  });
});

describe("transcribeChatVoice", () => {
  it("uploads a base64-encoded blob to the gateway", async () => {
    const client = {
      request: vi.fn().mockResolvedValue({ text: "hello world" }),
    };
    const blob = new Blob(["voice"], { type: "audio/webm" });

    await expect(
      transcribeChatVoice({
        client: client as never,
        blob,
      }),
    ).resolves.toBe("hello world");

    expect(client.request).toHaveBeenCalledWith("chat.voice.transcribe", {
      mimeType: "audio/webm",
      audioBase64: "dm9pY2U=",
      fileName: "voice-input.webm",
    });
  });
});
