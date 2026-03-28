import { beforeEach, describe, expect, it, vi } from "vitest";

const readConfigFileSnapshot = vi.hoisted(() => vi.fn());

vi.mock("../../config/config.js", () => ({
  readConfigFileSnapshot,
}));

import { chatElevenLabsVoiceHandlers } from "./chat-elevenlabs-voice.js";

describe("chat.voice.elevenlabs.status", () => {
  beforeEach(() => {
    readConfigFileSnapshot.mockReset();
    vi.restoreAllMocks();
  });

  it("reports disabled when ElevenLabs is not configured", async () => {
    readConfigFileSnapshot.mockResolvedValue({ config: {} });
    const respond = vi.fn();

    await chatElevenLabsVoiceHandlers["chat.voice.elevenlabs.status"]({
      req: {} as never,
      params: {} as never,
      respond: respond as never,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        enabled: false,
        acceptedMimeTypes: expect.arrayContaining(["audio/webm", "audio/ogg"]),
      }),
      undefined,
    );
  });
});

describe("chat.voice.elevenlabs.transcribe", () => {
  beforeEach(() => {
    readConfigFileSnapshot.mockReset();
    vi.restoreAllMocks();
  });

  it("rejects unsupported audio MIME types", async () => {
    readConfigFileSnapshot.mockResolvedValue({
      config: {
        talk: {
          providers: {
            elevenlabs: {
              apiKey: "test-elevenlabs-key",
            },
          },
        },
      },
    });
    const respond = vi.fn();

    await chatElevenLabsVoiceHandlers["chat.voice.elevenlabs.transcribe"]({
      req: {} as never,
      params: {
        mimeType: "text/plain",
        audioBase64: Buffer.from("hello").toString("base64"),
      } as never,
      respond: respond as never,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        message: "unsupported audio MIME type",
      }),
    );
  });

  it("posts audio to ElevenLabs and returns the transcript", async () => {
    readConfigFileSnapshot.mockResolvedValue({
      config: {
        talk: {
          providers: {
            elevenlabs: {
              apiKey: "test-elevenlabs-key",
            },
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "elevenlabs transcript" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const respond = vi.fn();

    await chatElevenLabsVoiceHandlers["chat.voice.elevenlabs.transcribe"]({
      req: {} as never,
      params: {
        mimeType: "audio/webm;codecs=opus",
        audioBase64: Buffer.from("voice-bytes").toString("base64"),
        fileName: "prompt.webm",
      } as never,
      respond: respond as never,
      context: {} as never,
      client: null,
      isWebchatConnect: () => false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/speech-to-text",
      expect.objectContaining({
        method: "POST",
        headers: {
          "xi-api-key": "test-elevenlabs-key",
        },
        body: expect.any(FormData),
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, { text: "elevenlabs transcript" }, undefined);
  });
});
