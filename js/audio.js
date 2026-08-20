import { storage } from "./firebase-init.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// MediaRecorder's actual output format depends on the browser — Chrome
// defaults to audio/webm;codecs=opus, Safari doesn't support webm at all
// and uses audio/mp4 instead. Previously the recorded Blob was always
// hard-labeled "audio/webm" no matter what was actually recorded, so on
// any browser that didn't default to webm, the <audio> element was
// being handed a file labeled as a format it wasn't actually in — which
// plays as silent "error" with no sound. Explicitly picking (and then
// honoring) a supported mimeType fixes that.
const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/aac",
  "audio/ogg;codecs=opus",
];

function pickSupportedMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // let the browser pick its own default
}

/** Rough file extension for a given recorded mimeType — cosmetic only;
 * playback correctness comes from the Storage contentType, not this. */
export function extensionForMimeType(mimeType) {
  if (!mimeType) return "webm";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("aac")) return "aac";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Wraps the MediaRecorder API. Usage:
 *   const rec = new AppRecorder();
 *   await rec.start();
 *   ...
 *   const blob = await rec.stop();
 *   rec.mimeType // the actual format the blob was recorded in
 */
export class AppRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
    this.mimeType = "";
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    const mimeType = pickSupportedMimeType();
    this.mediaRecorder = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);
    // Use whatever the recorder actually settled on, not just our request.
    this.mimeType = this.mediaRecorder.mimeType || mimeType || "audio/webm";
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  get isSupported() {
    return !!(navigator.mediaDevices && window.MediaRecorder);
  }
}

export async function uploadAudioBlob(blob, path) {
  const storageRef = ref(storage, path);
  // Use the blob's own recorded type, not a hardcoded guess, so the
  // file's stored Content-Type always matches what's actually inside it.
  await uploadBytes(storageRef, blob, { contentType: blob.type || "audio/webm" });
  return getDownloadURL(storageRef);
}

export async function deleteAudio(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch (e) {
    console.warn("Could not delete audio:", e.message);
  }
}
