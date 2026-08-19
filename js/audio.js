import { storage } from "./firebase-init.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

/**
 * Wraps the MediaRecorder API. Usage:
 *   const rec = new AppRecorder();
 *   await rec.start();
 *   ...
 *   const blob = await rec.stop();
 */
export class AppRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.stream = null;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  stop() {
    return new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "audio/webm" });
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
  await uploadBytes(storageRef, blob, { contentType: "audio/webm" });
  return getDownloadURL(storageRef);
}

export async function deleteAudio(path) {
  try {
    await deleteObject(ref(storage, path));
  } catch (e) {
    // Not fatal — file may already be gone.
    console.warn("Could not delete audio:", e.message);
  }
}
