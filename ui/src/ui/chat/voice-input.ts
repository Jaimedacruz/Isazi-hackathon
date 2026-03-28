export type RecordedVoiceInput = {
  blob: Blob;
  mimeType: string;
};

export type ActiveVoiceRecording = {
  stop: () => Promise<RecordedVoiceInput>;
  cancel: () => void;
};

async function getMicrophonePermissionState(): Promise<PermissionState | null> {
  if (typeof navigator === "undefined" || typeof navigator.permissions?.query !== "function") {
    return null;
  }
  try {
    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return status.state;
  } catch {
    return null;
  }
}

async function hasAudioInputDevice(): Promise<boolean | null> {
  if (typeof navigator === "undefined" || typeof navigator.mediaDevices?.enumerateDevices !== "function") {
    return null;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some((device) => device.kind === "audioinput");
  } catch {
    return null;
  }
}

export async function formatVoiceRecordingError(
  error: unknown,
  opts?: { auto?: boolean },
): Promise<string> {
  const fallbackMessage = opts?.auto
    ? "Microphone start is waiting for permission. Allow the mic and try again."
    : "Microphone access failed.";

  const [permissionState, hasAudioInput] = await Promise.all([
    getMicrophonePermissionState(),
    hasAudioInputDevice(),
  ]);

  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError":
        if (permissionState === "granted") {
          return "Chrome is allowed to use the mic, but Windows is still blocking audio capture or another app is holding the microphone. Check Windows Settings > Privacy & security > Microphone, then close apps like Zoom, Teams, WhatsApp, or Discord and try again.";
        }
        return "Microphone permission is blocked. Allow microphone access in the address bar, then click the mic again.";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone was found on this device.";
      case "NotReadableError":
      case "TrackStartError":
        return "The microphone is busy in another app. Close other apps using the mic and try again.";
      default:
        break;
    }
  }

  if (error instanceof Error) {
    const normalized = error.message.trim().toLowerCase();
    if (normalized.includes("permission denied")) {
      if (permissionState === "granted") {
        return "Chrome is allowed to use the mic, but Windows is still blocking audio capture or another app is holding the microphone. Check Windows Settings > Privacy & security > Microphone, then close apps like Zoom, Teams, WhatsApp, or Discord and try again.";
      }
      return "Microphone permission is blocked. Allow microphone access in the address bar, then click the mic again.";
    }
    if (normalized.includes("could not start audio source")) {
      return "The microphone is busy in another app. Close other apps using the mic and try again.";
    }
    if (error.message.trim()) {
      return error.message;
    }
  }

  if (hasAudioInput === false) {
    return "No microphone was found on this device.";
  }

  return fallbackMessage;
}

const PREFERRED_RECORDING_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
] as const;

function getSupportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return undefined;
  }
  return PREFERRED_RECORDING_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

export function isVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function startVoiceRecording(): Promise<ActiveVoiceRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = getSupportedRecordingMimeType();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  const stopTracks = () => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
  };

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });
  recorder.start(250);

  return {
    stop: () =>
      new Promise<RecordedVoiceInput>((resolve, reject) => {
        recorder.addEventListener(
          "stop",
          () => {
            stopTracks();
            const resolvedMimeType = recorder.mimeType || mimeType || "audio/webm";
            resolve({
              blob: new Blob(chunks, { type: resolvedMimeType }),
              mimeType: resolvedMimeType,
            });
          },
          { once: true },
        );
        recorder.addEventListener(
          "error",
          () => {
            stopTracks();
            reject(new Error("Voice recording failed."));
          },
          { once: true },
        );
        recorder.stop();
      }),
    cancel: () => {
      stopTracks();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    },
  };
}
