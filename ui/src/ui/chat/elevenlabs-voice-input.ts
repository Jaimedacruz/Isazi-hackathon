export type RecordedElevenLabsVoiceInput = {
  blob: Blob;
  mimeType: string;
};

export type ActiveElevenLabsVoiceRecording = {
  stop: () => Promise<RecordedElevenLabsVoiceInput>;
  cancel: () => void;
};

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

export function isElevenLabsVoiceRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export async function startElevenLabsVoiceRecording(): Promise<ActiveElevenLabsVoiceRecording> {
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
      new Promise<RecordedElevenLabsVoiceInput>((resolve, reject) => {
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
            reject(new Error("ElevenLabs voice recording failed."));
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
