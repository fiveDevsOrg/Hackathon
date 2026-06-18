const STORAGE_KEY = "gesture-lab-samples-v1";
const TRAIL_LIMIT = 18;
const PINCH_START_DISTANCE = 48;
const PINCH_RELEASE_DISTANCE = 82;
const PINCH_GRACE_MS = 260;
const ZOOM_MIN_DELTA = 4.5;

const gestureLabels = {
  "pinch-click": "Pinch click",
  "pinch-drag": "Pinch drag",
  "swipe-left": "Swipe left",
  "swipe-right": "Swipe right",
  "zoom-in": "Zoom in",
  "zoom-out": "Zoom out"
};

export function createGestureWorkspace(canvas, ctx) {
  return new GestureWorkspace(canvas, ctx);
}

class GestureWorkspace {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.mode = "sandbox";
    this.activeGesture = "pinch-click";
    this.recording = false;
    this.frames = [];
    this.samples = loadSamples();
    this.trails = new Map();
    this.sandbox = createSandboxItems();
    this.selectedIndex = 0;
    this.grabbedId = null;
    this.lastPinchAt = 0;
    this.lastPinchCenter = null;
    this.lastAction = "Ready";
    this.lastSwipeAt = 0;
    this.lastTwoHandDistance = null;
    this.layoutKey = "";
  }

  start(mode, gesture) {
    this.mode = mode;
    this.activeGesture = gesture;
    this.recording = false;
    this.frames = [];
    this.trails = new Map();
    this.lastAction = mode === "capture" ? "Ready to record" : "Sandbox ready";
  }

  stop() {
    this.recording = false;
    this.frames = [];
    this.trails = new Map();
    this.grabbedId = null;
    this.lastPinchAt = 0;
    this.lastPinchCenter = null;
    this.lastTwoHandDistance = null;
  }

  setMode(mode) {
    this.mode = mode;
    this.recording = false;
    this.frames = [];
    this.grabbedId = null;
    this.lastPinchAt = 0;
    this.lastPinchCenter = null;
    this.lastTwoHandDistance = null;
    this.lastAction = mode === "capture" ? "Ready to record" : "Sandbox ready";
  }

  setGesture(gesture) {
    this.activeGesture = gesture;
  }

  isRecording() {
    return this.recording;
  }

  startRecording(gesture) {
    this.activeGesture = gesture;
    this.recording = true;
    this.frames = [];
    this.lastAction = "Recording";
  }

  stopRecording() {
    if (!this.recording) {
      return;
    }

    this.recording = false;

    if (this.frames.length < 6) {
      this.lastAction = "Sample too short";
      this.frames = [];
      return;
    }

    const sample = {
      id: crypto.randomUUID(),
      gesture: this.activeGesture,
      label: gestureLabels[this.activeGesture],
      createdAt: new Date().toISOString(),
      durationMs: Math.round(this.frames[this.frames.length - 1].t - this.frames[0].t),
      frameCount: this.frames.length,
      summary: summarizeFrames(this.frames),
      frames: this.frames
    };

    this.samples.push(sample);
    saveSamples(this.samples);
    this.frames = [];
    this.lastAction = `Stored ${sample.label}`;
  }

  update(hands, mode) {
    this.mode = mode;
    this.layoutSandboxItems();
    this.updateTrails(hands);

    if (this.mode === "capture" && this.recording) {
      this.frames.push(captureFrame(hands, performance.now(), this.canvas.width));
    }

    if (this.mode === "sandbox") {
      this.updateSandbox(hands);
    }

    return this.snapshot();
  }

  draw(hands, mode) {
    this.layoutSandboxItems();

    if (mode === "sandbox") {
      this.drawSandbox();
    } else {
      this.drawCapturePanel();
    }

    this.drawHandHints(hands);
  }

  layoutSandboxItems() {
    const key = `${this.canvas.width}x${this.canvas.height}`;

    if (this.layoutKey === key) {
      return;
    }

    this.layoutKey = key;

    const centerY = this.canvas.height * 0.48;
    const gap = Math.min(280, this.canvas.width * 0.24);
    const centerX = this.canvas.width / 2;
    const positions = [
      { x: centerX - gap, y: centerY },
      { x: centerX, y: centerY + Math.min(90, this.canvas.height * 0.1) },
      { x: centerX + gap, y: centerY }
    ];

    for (let index = 0; index < this.sandbox.length; index += 1) {
      this.sandbox[index].x = positions[index].x;
      this.sandbox[index].y = positions[index].y;
      this.sandbox[index].radius = Math.max(48, Math.min(78, this.canvas.width * 0.07));
    }
  }

  snapshot() {
    const selected = this.sandbox[this.selectedIndex];

    return {
      label: this.mode === "capture" ? gestureLabels[this.activeGesture] : selected.label,
      samples: this.samples.length,
      action: this.lastAction,
      state: this.recording ? "Recording" : this.lastAction
    };
  }

  updateSandbox(hands) {
    const primary = getPrimaryHand(hands);
    const pinch = primary ? getPinch(primary, this.canvas.width) : null;
    const now = performance.now();
    const grabbed = this.sandbox.find((item) => item.id === this.grabbedId);
    const pinchDistanceLimit = this.grabbedId ? PINCH_RELEASE_DISTANCE : PINCH_START_DISTANCE;
    const pinchActive = Boolean(pinch && pinch.distance < pinchDistanceLimit);

    if (pinchActive) {
      this.lastPinchAt = now;
      this.lastPinchCenter = pinch.center;
      const selected = this.sandbox[this.selectedIndex];

      if (!this.grabbedId && distance(pinch.center, selected) < selected.radius + 42) {
        this.grabbedId = selected.id;
        this.lastAction = "Grab";
      }

      const activeItem = this.sandbox.find((item) => item.id === this.grabbedId);

      if (activeItem) {
        activeItem.x = pinch.center.x;
        activeItem.y = pinch.center.y;
        this.lastAction = "Dragging";
      }
    } else if (grabbed && now - this.lastPinchAt < PINCH_GRACE_MS) {
      if (pinch?.center) {
        this.lastPinchCenter = pinch.center;
        grabbed.x = pinch.center.x;
        grabbed.y = pinch.center.y;
      } else if (this.lastPinchCenter) {
        grabbed.x = this.lastPinchCenter.x;
        grabbed.y = this.lastPinchCenter.y;
      }

      this.lastAction = "Dragging";
    } else if (this.grabbedId) {
      this.grabbedId = null;
      this.lastPinchCenter = null;
      this.lastAction = "Released";
    }

    const twoHandDistance = this.grabbedId || anyHandPinching(hands, this.canvas.width)
      ? NaN
      : getTwoHandDistance(hands, this.canvas.width);

    if (Number.isFinite(twoHandDistance)) {
      if (Number.isFinite(this.lastTwoHandDistance)) {
        const delta = twoHandDistance - this.lastTwoHandDistance;
        const selected = this.sandbox[this.selectedIndex];

        if (Math.abs(delta) > ZOOM_MIN_DELTA) {
          selected.scale = clamp(selected.scale + delta * 0.0035, 0.45, 2.4);
          this.lastAction = delta > 0 ? "Zoom out" : "Zoom in";
        }
      }

      this.lastTwoHandDistance = twoHandDistance;
    } else {
      this.lastTwoHandDistance = null;
    }

    const swipe = primary && !this.grabbedId && !pinchActive && !Number.isFinite(twoHandDistance)
      ? detectSwipe(primary, this.trails.get(primary.handedness), this.canvas.width)
      : null;

    if (swipe && now - this.lastSwipeAt > 650) {
      this.selectedIndex = wrapIndex(this.selectedIndex + (swipe === "right" ? 1 : -1), this.sandbox.length);
      this.lastSwipeAt = now;
      this.lastAction = swipe === "right" ? "Swipe right" : "Swipe left";
      this.trails.set(primary.handedness, []);
    }
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
      trail.unshift({ x: this.canvas.width - indexTip.x, y: indexTip.y, t: performance.now() });
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

  drawCapturePanel() {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(5, 9, 14, 0.48)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.textAlign = "center";
    this.ctx.fillStyle = "#f7fafc";
    this.ctx.font = "800 34px Inter, system-ui, sans-serif";
    this.ctx.fillText(gestureLabels[this.activeGesture], this.canvas.width / 2, this.canvas.height * 0.34);
    this.ctx.font = "500 17px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#c7d2df";
    this.ctx.fillText(captureInstruction(this.activeGesture), this.canvas.width / 2, this.canvas.height * 0.34 + 38);
    this.ctx.font = "700 20px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = this.recording ? "#ff5a6a" : "#35d07f";
    this.ctx.fillText(this.recording ? `${this.frames.length} frames captured` : `${this.samples.length} samples stored`, this.canvas.width / 2, this.canvas.height * 0.34 + 78);
    this.ctx.restore();
  }

  drawSandbox() {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(5, 9, 14, 0.28)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let index = 0; index < this.sandbox.length; index += 1) {
      const item = this.sandbox[index];
      const selected = index === this.selectedIndex;
      const radius = item.radius * item.scale;

      this.ctx.save();
      this.ctx.translate(item.x, item.y);
      this.ctx.fillStyle = selected ? item.color : "rgba(199, 210, 223, 0.32)";
      this.ctx.strokeStyle = selected ? "#ffffff" : "rgba(255,255,255,0.32)";
      this.ctx.lineWidth = selected ? 4 : 2;
      this.ctx.shadowColor = selected ? item.color : "transparent";
      this.ctx.shadowBlur = selected ? 22 : 0;
      this.ctx.beginPath();
      this.ctx.roundRect(-radius, -radius * 0.72, radius * 2, radius * 1.44, 14);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.fillStyle = "#061017";
      this.ctx.font = "800 18px Inter, system-ui, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText(item.label, 0, 6);
      this.ctx.restore();
    }

    this.ctx.fillStyle = "#c7d2df";
    this.ctx.font = "600 16px Inter, system-ui, sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.fillText("Pinch-hold to drag · Two open hands zoom · Open-hand swipe switches objects", this.canvas.width / 2, this.canvas.height - 132);
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

function createSandboxItems() {
  return [
    { id: "photo", label: "Photo", x: 0, y: 0, radius: 74, scale: 1, color: "#35d07f" },
    { id: "card", label: "Card", x: 0, y: 0, radius: 68, scale: 1, color: "#59a9ff" },
    { id: "panel", label: "Panel", x: 0, y: 0, radius: 78, scale: 1, color: "#f5c84b" }
  ];
}

function captureFrame(hands, now, canvasWidth) {
  return {
    t: now,
    hands: hands.map((hand) => ({
      handedness: hand.handedness,
      wrist: pointToFeature(getPoint(hand, 0), canvasWidth),
      thumbTip: pointToFeature(getPoint(hand, 4), canvasWidth),
      indexTip: pointToFeature(getPoint(hand, 8), canvasWidth),
      middleTip: pointToFeature(getPoint(hand, 12), canvasWidth),
      landmarks: hand.landmarks.map((point) => pointToFeature(point, canvasWidth))
    }))
  };
}

function summarizeFrames(frames) {
  return {
    handsSeen: Math.max(...frames.map((frame) => frame.hands.length)),
    durationMs: Math.round(frames[frames.length - 1].t - frames[0].t),
    frameCount: frames.length
  };
}

function captureInstruction(gesture) {
  if (gesture === "pinch-click") return "Close thumb and index, then release when done.";
  if (gesture === "pinch-drag") return "Pinch, move while holding, then release.";
  if (gesture === "swipe-left") return "Move one hand naturally from right to left.";
  if (gesture === "swipe-right") return "Move one hand naturally from left to right.";
  if (gesture === "zoom-in") return "Use two hands and bring them closer together.";
  return "Use two hands and move them apart.";
}

function getPrimaryHand(hands) {
  return hands[0] || null;
}

function getPinch(hand, canvasWidth) {
  const thumb = getPoint(hand, 4);
  const index = getPoint(hand, 8);

  if (!thumb || !index) return null;

  const thumbPoint = { x: canvasWidth - thumb.x, y: thumb.y };
  const indexPoint = { x: canvasWidth - index.x, y: index.y };
  const pinchDistance = distance(thumbPoint, indexPoint);

  return {
    distance: pinchDistance,
    isPinching: pinchDistance < PINCH_START_DISTANCE,
    center: {
      x: (thumbPoint.x + indexPoint.x) / 2,
      y: (thumbPoint.y + indexPoint.y) / 2
    }
  };
}

function getTwoHandDistance(hands, canvasWidth) {
  if (hands.length < 2) return NaN;

  if (!isOpenHand(hands[0], canvasWidth) || !isOpenHand(hands[1], canvasWidth)) return NaN;

  const first = getPoint(hands[0], 0);
  const second = getPoint(hands[1], 0);

  if (!first || !second) return NaN;

  return distance(
    { x: canvasWidth - first.x, y: first.y },
    { x: canvasWidth - second.x, y: second.y }
  );
}

function anyHandPinching(hands, canvasWidth) {
  return hands.some((hand) => {
    const pinch = getPinch(hand, canvasWidth);
    return pinch && pinch.distance < PINCH_RELEASE_DISTANCE;
  });
}

function detectSwipe(hand, trail, canvasWidth) {
  if (!isOpenHand(hand, canvasWidth) || !trail || trail.length < 8) return null;

  const newest = trail[0];
  const oldest = trail[Math.min(trail.length - 1, 10)];
  const dx = newest.x - oldest.x;
  const dy = Math.abs(newest.y - oldest.y);
  const dt = Math.max(1, newest.t - oldest.t);
  const speed = Math.abs(dx) / dt;

  if (Math.abs(dx) < 170 || dy > 70 || speed < 0.85) return null;

  return dx > 0 ? "right" : "left";
}

function isOpenHand(hand, canvasWidth) {
  const wrist = getPoint(hand, 0);
  const thumb = getPoint(hand, 4);
  const index = getPoint(hand, 8);
  const middle = getPoint(hand, 12);
  const ring = getPoint(hand, 16);
  const pinky = getPoint(hand, 20);

  if (!wrist || !thumb || !index || !middle || !ring || !pinky) return false;

  const wristPoint = { x: canvasWidth - wrist.x, y: wrist.y };
  const fingertips = [thumb, index, middle, ring, pinky]
    .map((point) => ({ x: canvasWidth - point.x, y: point.y }));
  const averageSpread = fingertips
    .reduce((total, point) => total + distance(point, wristPoint), 0) / fingertips.length;
  const pinch = getPinch(hand, canvasWidth);

  return averageSpread > 95 && pinch && pinch.distance > 64;
}

function loadSamples() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveSamples(samples) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(samples));
}

function getPoint(hand, index) {
  return hand.landmarks.find((point) => point.index === index);
}

function pointToFeature(point, canvasWidth) {
  if (!point) return null;
  return { x: canvasWidth - point.x, y: point.y, z: point.z };
}

function distance(a, b) {
  if (!a || !b) return NaN;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapIndex(value, length) {
  return (value + length) % length;
}
