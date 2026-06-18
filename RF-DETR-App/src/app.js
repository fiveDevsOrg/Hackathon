import { createDetector } from "./detector.js";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const cameraButton = document.querySelector("#cameraButton");
const statusText = document.querySelector("#statusText");
const detectorMode = document.querySelector("#detectorMode");
const personCount = document.querySelector("#personCount");
const confidenceValue = document.querySelector("#confidenceValue");

let stream = null;
let detector = null;
let animationFrame = null;

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

    detector = await createDetector();
    detectorMode.textContent = detector.label;
    cameraButton.textContent = "Stop camera";
    statusText.textContent = "Looking for head and shoulders";
    renderLoop();
  } catch (error) {
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
  detector = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  detectorMode.textContent = "Standby";
  personCount.textContent = "0";
  confidenceValue.textContent = "0%";
  statusText.textContent = "Camera idle";
  cameraButton.innerHTML = '<span class="button-icon" aria-hidden="true">●</span>Start camera';
}

async function renderLoop() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const detections = await detector.detect(video, canvas);
  drawDetections(detections);
  updateMetrics(detections);

  animationFrame = requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawDetections(detections) {
  for (const detection of detections) {
    const { x, y, width, height } = detection.box;
    const mirroredX = canvas.width - x - width;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#35d07f";
    ctx.fillStyle = "rgba(53, 208, 127, 0.12)";
    ctx.strokeRect(mirroredX, y, width, height);
    ctx.fillRect(mirroredX, y, width, height);

    ctx.fillStyle = "#35d07f";
    ctx.font = "600 14px Inter, system-ui, sans-serif";
    ctx.fillText(`${detection.label} ${Math.round(detection.score * 100)}%`, mirroredX + 10, Math.max(22, y - 10));

    drawShoulderLine(mirroredX, y, width, height);
    ctx.restore();
  }
}

function drawShoulderLine(x, y, width, height) {
  const shoulderY = y + height * 0.66;
  ctx.beginPath();
  ctx.moveTo(x + width * 0.12, shoulderY);
  ctx.quadraticCurveTo(x + width * 0.5, shoulderY + height * 0.08, x + width * 0.88, shoulderY);
  ctx.strokeStyle = "#f5c84b";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function updateMetrics(detections) {
  personCount.textContent = String(detections.length);
  const topScore = detections.reduce((score, detection) => Math.max(score, detection.score), 0);
  confidenceValue.textContent = `${Math.round(topScore * 100)}%`;
  statusText.textContent = detections.length ? "Head and shoulders identified" : "Looking for head and shoulders";
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
