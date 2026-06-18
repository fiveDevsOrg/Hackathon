import { createDetector } from "./detector.js?v=gesture-trainer-1";
import { createSlashGame } from "./game.js?v=gesture-trainer-1";
import { createGestureTrainer } from "./gesture-trainer.js?v=gesture-trainer-1";
import { createHandTracker } from "./hand-tracker.js?v=gesture-trainer-1";

const video = document.querySelector("#camera");
const sceneHost = document.querySelector("#scene3d");
const canvas = document.querySelector("#overlay");
const ctx = canvas.getContext("2d");
const cameraButton = document.querySelector("#cameraButton");
const gameModeButton = document.querySelector("#gameModeButton");
const trainerModeButton = document.querySelector("#trainerModeButton");
const statusText = document.querySelector("#statusText");
const metricOneLabel = document.querySelector("#metricOneLabel");
const metricTwoLabel = document.querySelector("#metricTwoLabel");
const metricThreeLabel = document.querySelector("#metricThreeLabel");
const scoreValue = document.querySelector("#scoreValue");
const streakValue = document.querySelector("#streakValue");
const timeValue = document.querySelector("#timeValue");

let stream = null;
let detector = null;
let handTracker = null;
let game = createSlashGame(canvas, ctx, sceneHost);
let trainer = createGestureTrainer(canvas, ctx);
let animationFrame = null;
let mode = "game";

gameModeButton.addEventListener("click", () => setMode("game"));
trainerModeButton.addEventListener("click", () => setMode("trainer"));

cameraButton.addEventListener("click", async () => {
  if (stream) {
    if (mode === "game" && game.isRoundOver()) {
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

    detector = mode === "game" ? await createDetector() : null;
    handTracker = mode === "trainer" ? await createHandTracker() : null;
    startActiveMode();
    renderLoop();
  } catch (error) {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
    }

    detector = null;
    handTracker = null;
    game.stop();
    trainer.stop();
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
  handTracker = null;
  game.stop();
  trainer.stop();
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  resetMetrics();
  statusText.textContent = "Camera idle";
  cameraButton.innerHTML = `<span class="button-icon" aria-hidden="true">●</span>${mode === "game" ? "Start game" : "Start trainer"}`;
}

async function renderLoop() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  try {
    if (mode === "trainer") {
      const hands = handTracker.detect(video, canvas);
      const trainerState = trainer.update(hands);
      game.arena.render();
      trainer.draw(hands);
      updateTrainerMetrics(trainerState, hands);
    } else {
      const detections = await detector.detect(video, canvas);
      const gameState = game.update(detections);
      game.draw(detections);
      updateGameMetrics(gameState, detections);
    }
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

function setMode(nextMode) {
  if (stream) {
    statusText.textContent = "Stop the current session before changing modes";
    return;
  }

  mode = nextMode;
  gameModeButton.classList.toggle("active", mode === "game");
  trainerModeButton.classList.toggle("active", mode === "trainer");
  resetMetrics();
  statusText.textContent = mode === "game" ? "Camera idle" : "Gesture trainer ready";
  cameraButton.innerHTML = `<span class="button-icon" aria-hidden="true">●</span>${mode === "game" ? "Start game" : "Start trainer"}`;
}

function startActiveMode() {
  if (mode === "trainer") {
    game.stop();
    trainer.start();
    cameraButton.textContent = "Stop trainer";
    statusText.textContent = `${handTracker.label}: follow the gesture prompt`;
    metricOneLabel.textContent = "Gesture";
    metricTwoLabel.textContent = "Score";
    metricThreeLabel.textContent = "Samples";
    return;
  }

  trainer.stop();
  game.start();
  cameraButton.textContent = "Stop game";
  statusText.textContent = `${detector.label}: slash green targets`;
  metricOneLabel.textContent = "Score";
  metricTwoLabel.textContent = "Streak";
  metricThreeLabel.textContent = "Time";
}

function resetMetrics() {
  if (mode === "trainer") {
    metricOneLabel.textContent = "Gesture";
    metricTwoLabel.textContent = "Score";
    metricThreeLabel.textContent = "Samples";
    scoreValue.textContent = "-";
    streakValue.textContent = "0%";
    timeValue.textContent = "0";
    return;
  }

  metricOneLabel.textContent = "Score";
  metricTwoLabel.textContent = "Streak";
  metricThreeLabel.textContent = "Time";
  scoreValue.textContent = "0";
  streakValue.textContent = "0";
  timeValue.textContent = "60";
}

function updateGameMetrics(gameState, detections) {
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

function updateTrainerMetrics(trainerState, hands) {
  scoreValue.textContent = trainerState.prompt.title;
  streakValue.textContent = `${trainerState.score}%`;
  timeValue.textContent = String(trainerState.attempts);
  statusText.textContent = hands.length ? trainerState.result : "Show one or two hands to the camera";
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
