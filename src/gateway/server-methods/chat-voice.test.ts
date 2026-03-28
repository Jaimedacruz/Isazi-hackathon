import { beforeEach, describe, expect, it, vi } from "vitest";

const readConfigFileSnapshot = vi.hoisted(() => vi.fn());

vi.mock("../../config/config.js", () => ({
  readConfigFileSnapshot,
}));

import { chatVoiceHandlers } from "./chat-voice.js";

describe("chat.voice.status", () => {
  beforeEach(() => {
    readConfigFileSnapshot.mockReset();
    vi.restoreAllMocks();
  });

  it("reports disabled when ElevenLabs is not configured", async () => {
    readConfigFileSnapshot.mockResolvedValue({ config: {} });
    const respond = vi.fn();

    await chatVoiceHandlers["chat.voice.status"]({
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

  it("reports enabled when OpenAI is configured", async () => {
    readConfigFileSnapshot.mockResolvedValue({
      config: {
        models: {
          providers: {
            openai: {
              apiKey: "test-openai-key",
            },
          },
        },
      },
    });
    const respond = vi.fn();

    await chatVoiceHandlers["chat.voice.status"]({
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
        enabled: true,
      }),
      undefined,
    );
  });
});

describe("chat.voice.transcribe", () => {
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

    await chatVoiceHandlers["chat.voice.transcribe"]({
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
      json: async () => ({ text: "transcribed prompt" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const respond = vi.fn();

    await chatVoiceHandlers["chat.voice.transcribe"]({
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
    expect(respond).toHaveBeenCalledWith(true, { text: "transcribed prompt" }, undefined);
  });

  it("posts audio to OpenAI and returns the transcript", async () => {
    readConfigFileSnapshot.mockResolvedValue({
      config: {
        models: {
          providers: {
            openai: {
              apiKey: "test-openai-key",
            },
          },
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: "openai transcript" }),
      body: null,
    });
    vi.stubGlobal("fetch", fetchMock);
    const respond = vi.fn();

    await chatVoiceHandlers["chat.voice.transcribe"]({
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
      "https://api.openai.com/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
        body: expect.any(FormData),
      }),
    );
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer test-openai-key");
    expect(respond).toHaveBeenCalledWith(true, { text: "openai transcript" }, undefined);
  });
});
