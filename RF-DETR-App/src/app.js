import { createGestureWorkspace } from "./gesture-trainer.js?v=sandbox-rules-1";
import { createHandTracker } from "./hand-tracker.js?v=sandbox-rules-1";
import { createArenaScene } from "./three-scene.js?v=sandbox-rules-1";

const video = document.querySelector("#camera");
const sceneHost = document.querySelector("#scene3d");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const cameraButton = document.querySelector("#cameraButton");
const recordButton = document.querySelector("#recordButton");
const captureModeButton = document.querySelector("#captureModeButton");
const sandboxModeButton = document.querySelector("#sandboxModeButton");
const gestureSelect = document.querySelector("#gestureSelect");
const statusText = document.querySelector("#statusText");
const metricOneLabel = document.querySelector("#metricOneLabel");
const metricTwoLabel = document.querySelector("#metricTwoLabel");
const metricThreeLabel = document.querySelector("#metricThreeLabel");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const timeValue = document.querySelector("#timeValue");

let stream = null;
let handTracker = null;
let animationFrame = null;
let mode = "sandbox";

const arena = createArenaScene(sceneHost);
const workspace = createGestureWorkspace(canvas, ctx);

captureModeButton.classList.toggle("active", false);
sandboxModeButton.classList.toggle("active", true);
gestureSelect.disabled = true;

captureModeButton.addEventListener("click", () => setMode("capture"));
sandboxModeButton.addEventListener("click", () => setMode("sandbox"));
gestureSelect.addEventListener("change", () => workspace.setGesture(gestureSelect.value));

recordButton.addEventListener("click", () => {
  if (!stream || mode !== "capture") {
    return;
  }

  if (workspace.isRecording()) {
    workspace.stopRecording();
    recordButton.textContent = "Record sample";
  } else {
    workspace.startRecording(gestureSelect.value);
    recordButton.textContent = "Stop recording";
  }
});

cameraButton.addEventListener("click", async () => {
  if (stream) {
    stopCamera();
    return;
  }

  cameraButton.disabled = true;
  statusText.textContent = "Requesting camera access";

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = stream;
    await video.play();

    handTracker = await createHandTracker();
    workspace.start(mode, gestureSelect.value);
    recordButton.disabled = mode !== "capture";
    cameraButton.textContent = "Stop camera";
    statusText.textContent = `${handTracker.label}: test gestures in sandbox`;
    renderLoop();
  } catch (error) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    }

    handTracker = null;
    workspace.stop();
    statusText.textContent = cameraErrorMessage(error);
  } finally {
    cameraButton.disabled = false;
  }
});

function stopCamera() {
  cancelAnimationFrame(animationFrame);
  animationFrame = null;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  handTracker = null;
  workspace.stop();
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  recordButton.disabled = true;
  recordButton.textContent = "Record sample";
  statusText.textContent = "Camera idle";
  cameraButton.innerHTML = '<span class="button-icon" aria-hidden="true">●</span>Start camera';
  updateMetrics(workspace.snapshot(), []);
}

function renderLoop() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  try {
    const hands = handTracker.detect(video, canvas);
    const state = workspace.update(hands, mode);
    arena.render();
    workspace.draw(hands, mode);
    updateMetrics(state, hands);
  } catch (error) {
    console.error("Gesture workspace failed", error);
    statusText.textContent = "Gesture tracking error";
  }

  animationFrame = requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function setMode(nextMode) {
  mode = nextMode;
  captureModeButton.classList.toggle("active", mode === "capture");
  sandboxModeButton.classList.toggle("active", mode === "sandbox");
  gestureSelect.disabled = mode !== "capture";
  recordButton.disabled = !stream || mode !== "capture";
  recordButton.textContent = "Record sample";
  workspace.setMode(mode);
  updateMetrics(workspace.snapshot(), []);
  statusText.textContent = stream
    ? `${handTracker.label}: test gestures in sandbox`
    : (mode === "capture" ? "Capture mode ready" : "Sandbox mode ready");
}

function updateMetrics(state, hands) {
  metricOneLabel.textContent = mode === "capture" ? "Gesture" : "Selected";
  metricTwoLabel.textContent = mode === "capture" ? "Samples" : "Action";
  metricThreeLabel.textContent = "State";

  scoreValue.textContent = state.label;
  streakValue.textContent = mode === "capture" ? String(state.samples) : state.action;
  timeValue.textContent = state.state;

  if (!stream) {
    return;
  }

  if (!hands.length) {
    statusText.textContent = "Show one or two hands to the camera";
    return;
  }

  statusText.textContent = mode === "capture"
    ? "Capture natural gesture movement, then stop recording"
    : "Pinch-hold to drag, use two open hands to zoom, swipe left/right to switch items";
}

function cameraErrorMessage(error) {
  if (error && error.name === "NotAllowedError") {
    return "Camera permission was blocked";
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser does not support camera access";
  }

  return "Camera could not be started";
}
