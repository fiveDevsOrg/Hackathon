import { createDetector } from "./detector.js?v=pose-landmarker-2";

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
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    }

    detector = null;
    detectorMode.textContent = "Standby";
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

  try {
    const detections = await detector.detect(video, canvas);
    drawDetections(detections);
    updateMetrics(detections);
  } catch (error) {
    console.error("Detector failed", error);
    statusText.textContent = "Detector error";
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

function drawDetections(detections) {
  for (const detection of detections) {
    const { x, y, width, height } = detection.box;
    const mirroredX = canvas.width - x - width;
    const labelY = y > 28 ? y - 10 : y + 20;

    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#35d07f";
    ctx.fillStyle = "rgba(53, 208, 127, 0.12)";
    ctx.strokeRect(mirroredX, y, width, height);
    ctx.fillRect(mirroredX, y, width, height);

    ctx.fillStyle = "#35d07f";
    ctx.font = "600 14px Inter, system-ui, sans-serif";
    ctx.fillText(`${detection.label} ${Math.round(detection.score * 100)}%`, mirroredX + 10, labelY);

    if (detection.landmarks?.length) {
      drawPoseLandmarks(detection.landmarks);
    }

    ctx.restore();
  }
}

function drawPoseLandmarks(landmarks) {
  const points = new Map(
    landmarks.map((landmark) => [
      landmark.index,
      {
        x: canvas.width - landmark.x,
        y: landmark.y,
        visibility: landmark.visibility
      }
    ])
  );
  const connections = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24]
  ];
  const visibleLandmarkIndexes = [11, 12, 13, 14, 15, 16, 23, 24];

  ctx.strokeStyle = "#f5c84b";
  ctx.fillStyle = "#f5c84b";
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawHeadMarker(points);

  for (const [startIndex, endIndex] of connections) {
    const start = points.get(startIndex);
    const end = points.get(endIndex);

    if (!isVisiblePoint(start) || !isVisiblePoint(end)) {
      continue;
    }

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  for (const index of visibleLandmarkIndexes) {
    const point = points.get(index);

    if (!isVisiblePoint(point)) {
      continue;
    }

    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadMarker(points) {
  const nose = points.get(0);
  const leftShoulder = points.get(11);
  const rightShoulder = points.get(12);

  if (!isVisiblePoint(nose) || !isVisiblePoint(leftShoulder) || !isVisiblePoint(rightShoulder)) {
    return;
  }

  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
  const radius = Math.max(18, Math.min(48, shoulderWidth * 0.18));

  ctx.beginPath();
  ctx.arc(nose.x, nose.y + radius * 0.25, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function isVisiblePoint(point) {
  return point && point.visibility >= 0.35;
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
