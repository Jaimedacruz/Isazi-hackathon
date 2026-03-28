/* @vitest-environment jsdom */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatHost } from "./app-chat.ts";

const { setLastActiveSessionKeyMock } = vi.hoisted(() => ({
  setLastActiveSessionKeyMock: vi.fn(),
}));

const {
  transcribeChatElevenLabsVoiceMock,
  transcribeChatVoiceMock,
  sendChatMessageMock,
  resetToolStreamMock,
  resetChatScrollMock,
  scheduleChatScrollMock,
} = vi.hoisted(() => ({
  transcribeChatElevenLabsVoiceMock: vi.fn(),
  transcribeChatVoiceMock: vi.fn(),
  sendChatMessageMock: vi.fn(),
  resetToolStreamMock: vi.fn(),
  resetChatScrollMock: vi.fn(),
  scheduleChatScrollMock: vi.fn(),
}));

vi.mock("./app-settings.ts", () => ({
  setLastActiveSessionKey: (...args: unknown[]) => setLastActiveSessionKeyMock(...args),
}));

vi.mock("./controllers/chat-voice.ts", () => ({
  loadChatVoiceStatus: vi.fn(),
  transcribeChatVoice: (...args: unknown[]) => transcribeChatVoiceMock(...args),
}));

vi.mock("./controllers/chat-elevenlabs-voice.ts", () => ({
  loadChatElevenLabsVoiceStatus: vi.fn(),
  transcribeChatElevenLabsVoice: (...args: unknown[]) => transcribeChatElevenLabsVoiceMock(...args),
}));

vi.mock("./controllers/chat.ts", async () => {
  const actual = await vi.importActual<typeof import("./controllers/chat.ts")>("./controllers/chat.ts");
  return {
    ...actual,
    sendChatMessage: (...args: unknown[]) => sendChatMessageMock(...args),
  };
});

vi.mock("./app-tool-stream.ts", () => ({
  resetToolStream: (...args: unknown[]) => resetToolStreamMock(...args),
}));

vi.mock("./app-scroll.ts", async () => {
  const actual = await vi.importActual<typeof import("./app-scroll.ts")>("./app-scroll.ts");
  return {
    ...actual,
    resetChatScroll: (...args: unknown[]) => resetChatScrollMock(...args),
    scheduleChatScroll: (...args: unknown[]) => scheduleChatScrollMock(...args),
  };
});

let handleSendChat: typeof import("./app-chat.ts").handleSendChat;
let refreshChatAvatar: typeof import("./app-chat.ts").refreshChatAvatar;
let handleChatElevenLabsVoiceInput: typeof import("./app-chat.ts").handleChatElevenLabsVoiceInput;
let handleChatVoiceInput: typeof import("./app-chat.ts").handleChatVoiceInput;

async function loadChatHelpers(): Promise<void> {
  vi.resetModules();
  ({
    handleSendChat,
    refreshChatAvatar,
    handleChatElevenLabsVoiceInput,
    handleChatVoiceInput,
  } = await import("./app-chat.ts"));
}

function makeHost(overrides?: Partial<ChatHost>): ChatHost {
  return {
    client: null,
    chatMessages: [],
    chatStream: null,
      connected: true,
      chatMessage: "",
      chatElevenLabsVoiceInputBusy: false,
      chatElevenLabsVoiceInputEnabled: false,
      chatVoiceInputBusy: false,
      chatVoiceInputEnabled: false,
      chatAttachments: [],
    chatQueue: [],
    chatRunId: null,
    chatSending: false,
    lastError: null,
    sessionKey: "agent:main",
    basePath: "",
    hello: null,
    chatAvatarUrl: null,
    chatModelOverrides: {},
    chatModelsLoading: false,
    chatModelCatalog: [],
    refreshSessionsAfterChat: new Set<string>(),
    updateComplete: Promise.resolve(),
    ...overrides,
  };
}

describe("refreshChatAvatar", () => {
  beforeEach(async () => {
    await loadChatHelpers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a route-relative avatar endpoint before basePath bootstrap finishes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ avatarUrl: "/avatar/main" }),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const host = makeHost({ basePath: "", sessionKey: "agent:main" });
    await refreshChatAvatar(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "avatar/main?meta=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.chatAvatarUrl).toBe("/avatar/main");
  });

  it("keeps mounted dashboard avatar endpoints under the normalized base path", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const host = makeHost({ basePath: "/openclaw/", sessionKey: "agent:ops:main" });
    await refreshChatAvatar(host);

    expect(fetchMock).toHaveBeenCalledWith(
      "/openclaw/avatar/ops?meta=1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.chatAvatarUrl).toBeNull();
  });
});

describe("handleSendChat", () => {
  beforeEach(async () => {
    setLastActiveSessionKeyMock.mockReset();
    transcribeChatElevenLabsVoiceMock.mockReset();
    transcribeChatVoiceMock.mockReset();
    sendChatMessageMock.mockReset();
    resetToolStreamMock.mockReset();
    resetChatScrollMock.mockReset();
    scheduleChatScrollMock.mockReset();
    await loadChatHelpers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps slash-command model changes in sync with the chat header cache", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }) as unknown as typeof fetch,
    );
    const request = vi.fn(async (method: string, _params?: unknown) => {
      if (method === "sessions.patch") {
        return {
          ok: true,
          key: "main",
          resolved: {
            modelProvider: "openai",
            model: "gpt-5-mini",
          },
        };
      }
      if (method === "chat.history") {
        return { messages: [], thinkingLevel: null };
      }
      if (method === "sessions.list") {
        return {
          ts: 0,
          path: "",
          count: 0,
          defaults: { modelProvider: "openai", model: "gpt-5", contextTokens: null },
          sessions: [],
        };
      }
      if (method === "models.list") {
        return {
          models: [{ id: "gpt-5-mini", name: "GPT-5 Mini", provider: "openai" }],
        };
      }
      throw new Error(`Unexpected request: ${method}`);
    });
    const onSlashAction = vi.fn();
    const host = makeHost({
      client: { request } as unknown as ChatHost["client"],
      sessionKey: "main",
      chatMessage: "/model gpt-5-mini",
      onSlashAction,
    });

    await handleSendChat(host);

    expect(request).toHaveBeenCalledWith("sessions.patch", {
      key: "main",
      model: "gpt-5-mini",
    });
    expect(host.chatModelOverrides.main).toEqual({
      kind: "qualified",
      value: "openai/gpt-5-mini",
    });
    expect(onSlashAction).toHaveBeenCalledWith("refresh-tools-effective");
  });

  it("transcribes voice input and sends the transcript immediately", async () => {
    transcribeChatVoiceMock.mockResolvedValue("ship the patch");
    sendChatMessageMock.mockResolvedValue("run-123");

    const host = makeHost({
      client: { request: vi.fn() } as unknown as ChatHost["client"],
      chatMessage: "",
    });

    await handleChatVoiceInput(host, {
      blob: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
    });

    expect(transcribeChatVoiceMock).toHaveBeenCalled();
    expect(sendChatMessageMock).toHaveBeenCalled();
    expect(host.chatVoiceInputBusy).toBe(false);
    expect(host.chatMessage).toBe("ship the patch");
  });

  it("transcribes ElevenLabs voice input and sends the transcript immediately", async () => {
    transcribeChatElevenLabsVoiceMock.mockResolvedValue("ship the elevenlabs patch");
    sendChatMessageMock.mockResolvedValue("run-456");

    const host = makeHost({
      client: { request: vi.fn() } as unknown as ChatHost["client"],
      chatMessage: "",
    });

    await handleChatElevenLabsVoiceInput(host, {
      blob: new Blob(["voice"], { type: "audio/webm" }),
      mimeType: "audio/webm",
    });

    expect(transcribeChatElevenLabsVoiceMock).toHaveBeenCalled();
    expect(sendChatMessageMock).toHaveBeenCalled();
    expect(host.chatElevenLabsVoiceInputBusy).toBe(false);
    expect(host.chatMessage).toBe("ship the elevenlabs patch");
  });
});

afterAll(() => {
  vi.doUnmock("./app-settings.ts");
  vi.resetModules();
});
