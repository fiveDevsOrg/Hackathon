import { createDetector } from "./detector.js?v=slash-rush-1";
import { createSlashGame } from "./game.js?v=slash-rush-1";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const cameraButton = document.querySelector("#cameraButton");
const statusText = document.querySelector("#statusText");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const timeValue = document.querySelector("#timeValue");

let stream = null;
let detector = null;
let game = createSlashGame(canvas, ctx);
let animationFrame = null;

cameraButton.addEventListener("click", async () => {
  if (stream) {
    if (game.isRoundOver()) {
      game.start();
      cameraButton.textContent = "Stop game";
      statusText.textContent = "Slash green targets. Avoid red hazards.";
      return;
    }

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
    game.start();
    cameraButton.textContent = "Stop game";
    statusText.textContent = `${detector.label}: slash green targets`;
    renderLoop();
  } catch (error) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    }

    detector = null;
    game.stop();
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
  game.stop();
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  scoreValue.textContent = "0";
  streakValue.textContent = "0";
  timeValue.textContent = "60";
  statusText.textContent = "Camera idle";
  cameraButton.innerHTML = '<span class="button-icon" aria-hidden="true">●</span>Start game';
}

async function renderLoop() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  try {
    const detections = await detector.detect(video, canvas);
    const gameState = game.update(detections);
    game.draw(detections);
    updateMetrics(gameState, detections);
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

function updateMetrics(gameState, detections) {
  scoreValue.textContent = String(gameState.score);
  streakValue.textContent = String(gameState.streak);
  timeValue.textContent = String(gameState.time);

  if (!gameState.running && gameState.time === 0) {
    statusText.textContent = `Round over: ${gameState.score} points`;
    cameraButton.textContent = "New round";
    return;
  }

  statusText.textContent = detections.length ? "Slash green targets. Avoid red hazards." : "Step into camera view";
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
