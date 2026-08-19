import { el } from "../dom.js";
import { AppRecorder } from "../audio.js";

/**
 * Creates a small record/re-record/play widget.
 * onChange(blob|null) fires whenever the recorded blob changes.
 * Returns { node, getBlob(), reset() }.
 */
export function createRecorderWidget({ onChange } = {}) {
  const recorder = new AppRecorder();
  let blob = null;
  let objectUrl = null;
  let recording = false;

  const status = el("span", { class: "rec-widget__status" }, "No recording yet");
  const audioEl = el("audio", { controls: true, class: "rec-widget__player hidden" });

  const btn = el("button", {
    type: "button",
    class: "btn btn--rec",
    onclick: async () => {
      if (!recorder.isSupported) {
        status.textContent = "Microphone not supported in this browser.";
        return;
      }
      if (!recording) {
        try {
          await recorder.start();
          recording = true;
          btn.textContent = "⏹ Stop";
          btn.classList.add("btn--rec-active");
          status.textContent = "Recording…";
        } catch (err) {
          status.textContent = "Microphone permission denied.";
        }
      } else {
        blob = await recorder.stop();
        recording = false;
        btn.textContent = "🔴 Re-record";
        btn.classList.remove("btn--rec-active");
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(blob);
        audioEl.src = objectUrl;
        audioEl.classList.remove("hidden");
        status.textContent = "Recorded — preview below.";
        onChange && onChange(blob);
      }
    },
  }, "🎙 Record");

  const node = el("div", { class: "rec-widget" }, [btn, status, audioEl]);

  return {
    node,
    getBlob: () => blob,
    reset: () => {
      blob = null;
      audioEl.classList.add("hidden");
      status.textContent = "No recording yet";
      btn.textContent = "🎙 Record";
    },
  };
}

/** Small inline play button for an existing audio URL. */
export function playButton(url, label = "▶ Play") {
  if (!url) return el("span", { class: "muted" }, "No audio");
  const audioEl = el("audio", { src: url, preload: "none" });
  return el("button", {
    type: "button",
    class: "btn btn--ghost btn--sm",
    onclick: () => {
      audioEl.currentTime = 0;
      audioEl.play();
    },
  }, label);
}
