const ATTEMPT_MS = 2200;
const TRAIL_LIMIT = 12;

const prompts = [
  {
    id: "pinch",
    title: "Pinch click",
    instruction: "Touch thumb and index finger together, then release.",
    metric: "Pinch"
  },
  {
    id: "swipe-right",
    title: "Swipe right",
    instruction: "Move one open hand quickly from left to right.",
    metric: "Swipe"
  },
  {
    id: "zoom-out",
    title: "Zoom out",
    instruction: "Use two hands and move them apart.",
    metric: "Zoom"
  }
];

export function createGestureTrainer(canvas, ctx) {
  return new GestureTrainer(canvas, ctx);
}

class GestureTrainer {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.running = false;
    this.promptIndex = 0;
    this.frames = [];
    this.samples = [];
    this.lastScore = 0;
    this.lastResult = "Ready";
    this.attemptStart = 0;
    this.trails = new Map();
  }

  start(now = performance.now()) {
    this.running = true;
    this.promptIndex = 0;
    this.frames = [];
    this.samples = [];
    this.lastScore = 0;
    this.lastResult = "Perform the prompted gesture";
    this.attemptStart = now;
    this.trails = new Map();
  }

  stop() {
    this.running = false;
    this.frames = [];
    this.trails = new Map();
  }

  update(hands, now = performance.now()) {
    if (!this.running) {
      return this.snapshot();
    }

    this.frames.push(captureFrame(hands, now, this.canvas.width));
    this.updateTrails(hands);

    if (now - this.attemptStart >= ATTEMPT_MS) {
      this.finishAttempt(now);
    }

    return this.snapshot();
  }

  draw(hands) {
    this.drawTrainerStage();
    this.drawHandHints(hands);
  }

  snapshot() {
    const prompt = prompts[this.promptIndex];

    return {
      prompt,
      score: this.lastScore,
      result: this.lastResult,
      attempts: this.samples.length,
      running: this.running
    };
  }

  finishAttempt(now) {
    const prompt = prompts[this.promptIndex];
    const evaluation = evaluateGesture(prompt.id, this.frames);
    const sample = {
      gesture: prompt.id,
      score: evaluation.score,
      passed: evaluation.passed,
      frames: this.frames
    };

    this.samples.push(sample);
    this.lastScore = evaluation.score;
    this.lastResult = evaluation.passed ? `Good ${prompt.metric.toLowerCase()}` : `Try ${prompt.metric.toLowerCase()} again`;
    this.promptIndex = (this.promptIndex + 1) % prompts.length;
    this.frames = [];
    this.attemptStart = now;
  }

  updateTrails(hands) {
    const seen = new Set();

    for (const hand of hands) {
      const indexTip = getPoint(hand, 8);

      if (!indexTip) {
        continue;
      }

      const id = hand.handedness;
      seen.add(id);
      const trail = this.trails.get(id) || [];
      trail.unshift({ x: this.canvas.width - indexTip.x, y: indexTip.y });
      this.trails.set(id, trail.slice(0, TRAIL_LIMIT));
    }

    for (const id of this.trails.keys()) {
      if (!seen.has(id)) {
        const trail = this.trails.get(id).slice(0, -1);

        if (trail.length) {
          this.trails.set(id, trail);
        } else {
          this.trails.delete(id);
        }
      }
    }
  }

  drawTrainerStage() {
    const prompt = prompts[this.promptIndex];
    const progress = Math.min(1, (performance.now() - this.attemptStart) / ATTEMPT_MS);

    this.ctx.save();
    this.ctx.fillStyle = "rgba(5, 9, 14, 0.44)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#f7fafc";
    this.ctx.textAlign = "center";
    this.ctx.font = "800 34px Inter, system-ui, sans-serif";
    this.ctx.fillText(prompt.title, this.canvas.width / 2, this.canvas.height * 0.36);
    this.ctx.font = "500 17px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#c7d2df";
    this.ctx.fillText(prompt.instruction, this.canvas.width / 2, this.canvas.height * 0.36 + 36);

    const barWidth = Math.min(460, this.canvas.width * 0.72);
    const barX = (this.canvas.width - barWidth) / 2;
    const barY = this.canvas.height * 0.36 + 64;
    this.ctx.fillStyle = "rgba(255,255,255,0.16)";
    this.ctx.fillRect(barX, barY, barWidth, 8);
    this.ctx.fillStyle = "#35d07f";
    this.ctx.fillRect(barX, barY, barWidth * progress, 8);

    this.ctx.font = "700 20px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = this.lastScore >= 70 ? "#35d07f" : "#f5c84b";
    this.ctx.fillText(`${this.lastResult} · ${this.lastScore}%`, this.canvas.width / 2, barY + 44);
    this.ctx.restore();
  }

  drawHandHints(hands) {
    for (const [id, trail] of this.trails.entries()) {
      if (trail.length < 2) {
        continue;
      }

      this.ctx.save();
      this.ctx.strokeStyle = id === "Left" ? "#35d07f" : "#59a9ff";
      this.ctx.lineWidth = 6;
      this.ctx.lineCap = "round";
      this.ctx.shadowColor = this.ctx.strokeStyle;
      this.ctx.shadowBlur = 16;
      this.ctx.beginPath();
      this.ctx.moveTo(trail[0].x, trail[0].y);

      for (let index = 1; index < trail.length; index += 1) {
        this.ctx.lineTo(trail[index].x, trail[index].y);
      }

      this.ctx.stroke();
      this.ctx.restore();
    }

    for (const hand of hands) {
      const thumb = getPoint(hand, 4);
      const index = getPoint(hand, 8);

      for (const point of [thumb, index]) {
        if (!point) {
          continue;
        }

        this.ctx.save();
        this.ctx.fillStyle = hand.handedness === "Left" ? "#35d07f" : "#59a9ff";
        this.ctx.strokeStyle = "rgba(255,255,255,0.82)";
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width - point.x, point.y, 9, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
        this.ctx.restore();
      }
    }
  }
}

function captureFrame(hands, now, canvasWidth) {
  return {
    t: now,
    hands: hands.map((hand) => ({
      handedness: hand.handedness,
      wrist: pointToFeature(getPoint(hand, 0), canvasWidth),
      thumbTip: pointToFeature(getPoint(hand, 4), canvasWidth),
      indexTip: pointToFeature(getPoint(hand, 8), canvasWidth),
      middleTip: pointToFeature(getPoint(hand, 12), canvasWidth)
    }))
  };
}

function evaluateGesture(gesture, frames) {
  if (gesture === "pinch") {
    return evaluatePinch(frames);
  }

  if (gesture === "swipe-right") {
    return evaluateSwipeRight(frames);
  }

  return evaluateZoomOut(frames);
}

function evaluatePinch(frames) {
  const distances = frames.flatMap((frame) => frame.hands.map((hand) => distance(hand.thumbTip, hand.indexTip)).filter(Number.isFinite));
  const minDistance = Math.min(...distances);
  const maxDistance = Math.max(...distances);
  const closeScore = clampScore(100 - minDistance * 2.4);
  const motionScore = clampScore((maxDistance - minDistance) * 1.8);
  const score = Math.round(closeScore * 0.72 + motionScore * 0.28);

  return { score, passed: score >= 70 };
}

function evaluateSwipeRight(frames) {
  const score = Math.max(...frames[0]?.hands.map((_, handIndex) => {
    const points = frames.map((frame) => frame.hands[handIndex]?.indexTip).filter(Boolean);

    if (points.length < 3) {
      return 0;
    }

    const dx = points[points.length - 1].x - points[0].x;
    const dy = Math.abs(points[points.length - 1].y - points[0].y);
    return clampScore(dx * 0.72 - dy * 0.18);
  }) || [0]);

  return { score: Math.round(score), passed: score >= 70 };
}

function evaluateZoomOut(frames) {
  const distances = frames.map((frame) => {
    if (frame.hands.length < 2) {
      return null;
    }

    return distance(frame.hands[0].indexTip, frame.hands[1].indexTip);
  }).filter(Number.isFinite);

  if (distances.length < 3) {
    return { score: 0, passed: false };
  }

  const delta = distances[distances.length - 1] - distances[0];
  const score = Math.round(clampScore(delta * 0.7));
  return { score, passed: score >= 70 };
}

function getPoint(hand, index) {
  return hand.landmarks.find((point) => point.index === index);
}

function pointToFeature(point, canvasWidth) {
  if (!point) {
    return null;
  }

  return { x: canvasWidth - point.x, y: point.y, z: point.z };
}

function distance(a, b) {
  if (!a || !b) {
    return NaN;
  }

  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampScore(value) {
  return Math.max(0, Math.min(100, value));
}
