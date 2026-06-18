const ROUND_SECONDS = 60;
const TARGET_RADIUS = 24;
const HAZARD_RADIUS = 28;
const WRIST_RADIUS = 20;
const MAX_TRAIL_POINTS = 10;
const SPAWN_INTERVAL_MS = 760;

export function createSlashGame(canvas, ctx) {
  return new SlashGame(canvas, ctx);
}

class SlashGame {
  constructor(canvas, ctx) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.targets = [];
    this.effects = [];
    this.trails = new Map();
    this.score = 0;
    this.streak = 0;
    this.roundStart = 0;
    this.lastSpawn = 0;
    this.lastFrame = 0;
    this.running = false;
  }

  start(now = performance.now()) {
    this.targets = [];
    this.effects = [];
    this.trails = new Map();
    this.score = 0;
    this.streak = 0;
    this.roundStart = now;
    this.lastSpawn = now;
    this.lastFrame = now;
    this.running = true;
  }

  stop() {
    this.running = false;
    this.targets = [];
    this.effects = [];
    this.trails = new Map();
  }

  isRoundOver() {
    return Boolean(this.roundStart) && !this.running && this.secondsLeft() === 0;
  }

  update(detections, now = performance.now()) {
    if (!this.running) {
      return this.snapshot();
    }

    const delta = Math.min(48, now - this.lastFrame);
    this.lastFrame = now;
    const secondsLeft = this.secondsLeft(now);

    if (secondsLeft <= 0) {
      this.running = false;
      return this.snapshot();
    }

    if (now - this.lastSpawn >= SPAWN_INTERVAL_MS) {
      this.spawnTarget();
      this.lastSpawn = now;
    }

    const wrists = this.extractWrists(detections);
    this.updateTrails(wrists);
    this.moveTargets(delta);
    this.checkHits(wrists);
    this.pruneTargets();
    this.updateEffects(delta);

    return this.snapshot();
  }

  draw(detections) {
    this.drawArena();
    this.drawTargets();
    this.drawTrails();
    this.drawWristCursors(detections);
    this.drawEffects();

    if (!this.running) {
      this.drawReadyOverlay();
    }
  }

  snapshot() {
    return {
      score: this.score,
      streak: this.streak,
      time: this.secondsLeft(),
      running: this.running,
      targets: this.targets.length
    };
  }

  secondsLeft(now = performance.now()) {
    if (!this.roundStart) {
      return ROUND_SECONDS;
    }

    return Math.max(0, Math.ceil(ROUND_SECONDS - (now - this.roundStart) / 1000));
  }

  spawnTarget() {
    const edge = Math.floor(Math.random() * 4);
    const margin = 60;
    const center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    const target = {
      id: crypto.randomUUID(),
      type: Math.random() < 0.18 ? "hazard" : "target",
      x: 0,
      y: 0,
      radius: TARGET_RADIUS,
      speed: 0.12 + Math.random() * 0.11,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.008
    };

    if (target.type === "hazard") {
      target.radius = HAZARD_RADIUS;
      target.speed *= 0.82;
    }

    if (edge === 0) {
      target.x = Math.random() * this.canvas.width;
      target.y = -margin;
    } else if (edge === 1) {
      target.x = this.canvas.width + margin;
      target.y = Math.random() * this.canvas.height;
    } else if (edge === 2) {
      target.x = Math.random() * this.canvas.width;
      target.y = this.canvas.height + margin;
    } else {
      target.x = -margin;
      target.y = Math.random() * this.canvas.height;
    }

    const angle = Math.atan2(center.y - target.y, center.x - target.x) + (Math.random() - 0.5) * 0.8;
    target.vx = Math.cos(angle) * target.speed;
    target.vy = Math.sin(angle) * target.speed;
    this.targets.push(target);
  }

  extractWrists(detections) {
    const detection = detections.find((item) => item.landmarks?.length);

    if (!detection) {
      return [];
    }

    return detection.landmarks
      .filter((point) => (point.index === 15 || point.index === 16) && point.visibility >= 0.35)
      .map((point) => ({
        id: point.index === 15 ? "left" : "right",
        x: this.canvas.width - point.x,
        y: point.y
      }));
  }

  updateTrails(wrists) {
    const seen = new Set();

    for (const wrist of wrists) {
      seen.add(wrist.id);
      const trail = this.trails.get(wrist.id) || [];
      trail.unshift({ x: wrist.x, y: wrist.y });
      this.trails.set(wrist.id, trail.slice(0, MAX_TRAIL_POINTS));
    }

    for (const key of this.trails.keys()) {
      if (!seen.has(key)) {
        const trail = this.trails.get(key).slice(0, -1);

        if (trail.length) {
          this.trails.set(key, trail);
        } else {
          this.trails.delete(key);
        }
      }
    }
  }

  moveTargets(delta) {
    for (const target of this.targets) {
      target.x += target.vx * delta;
      target.y += target.vy * delta;
      target.rotation += target.spin * delta;
    }
  }

  checkHits(wrists) {
    for (const wrist of wrists) {
      const trail = this.trails.get(wrist.id) || [wrist];

      for (const target of this.targets) {
        if (target.hit) {
          continue;
        }

        if (trail.some((point) => distance(point, target) <= target.radius + WRIST_RADIUS)) {
          target.hit = true;
          this.registerHit(target);
        }
      }
    }
  }

  registerHit(target) {
    if (target.type === "hazard") {
      this.score = Math.max(0, this.score - 75);
      this.streak = 0;
      this.effects.push(createEffect(target.x, target.y, "#ff5a6a", "-75"));
      return;
    }

    this.streak += 1;
    const points = 100 + Math.min(250, this.streak * 10);
    this.score += points;
    this.effects.push(createEffect(target.x, target.y, "#35d07f", `+${points}`));
  }

  pruneTargets() {
    const buffer = 120;
    this.targets = this.targets.filter((target) => {
      if (target.hit) {
        return false;
      }

      const offscreen = target.x < -buffer ||
        target.x > this.canvas.width + buffer ||
        target.y < -buffer ||
        target.y > this.canvas.height + buffer;

      if (offscreen && target.type === "target") {
        this.streak = 0;
      }

      return !offscreen;
    });
  }

  updateEffects(delta) {
    for (const effect of this.effects) {
      effect.life -= delta;
      effect.y -= delta * 0.05;
    }

    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  drawArena() {
    const gradient = this.ctx.createRadialGradient(
      this.canvas.width * 0.5,
      this.canvas.height * 0.46,
      this.canvas.width * 0.08,
      this.canvas.width * 0.5,
      this.canvas.height * 0.5,
      Math.max(this.canvas.width, this.canvas.height) * 0.75
    );
    gradient.addColorStop(0, "#172533");
    gradient.addColorStop(0.54, "#0d141d");
    gradient.addColorStop(1, "#070b10");

    this.ctx.save();
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.globalAlpha = 0.18;
    this.ctx.strokeStyle = "#35d07f";
    this.ctx.lineWidth = 1;

    const gridSize = 72;
    const drift = (performance.now() * 0.012) % gridSize;

    for (let x = -gridSize + drift; x < this.canvas.width + gridSize; x += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }

    for (let y = -gridSize + drift; y < this.canvas.height + gridSize; y += gridSize) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1;
    this.ctx.strokeStyle = "rgba(89, 169, 255, 0.24)";
    this.ctx.lineWidth = 2;

    for (let radius = 140; radius < Math.max(this.canvas.width, this.canvas.height); radius += 140) {
      this.ctx.beginPath();
      this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  drawWristCursors(detections) {
    const wrists = this.extractWrists(detections);

    for (const wrist of wrists) {
      this.ctx.save();
      this.ctx.fillStyle = wrist.id === "left" ? "#35d07f" : "#59a9ff";
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = this.ctx.fillStyle;
      this.ctx.shadowBlur = 20;
      this.ctx.beginPath();
      this.ctx.arc(wrist.x, wrist.y, 12, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  drawTargets() {
    for (const target of this.targets) {
      this.ctx.save();
      this.ctx.translate(target.x, target.y);
      this.ctx.rotate(target.rotation);

      if (target.type === "hazard") {
        drawHazard(this.ctx, target.radius);
      } else {
        drawTarget(this.ctx, target.radius);
      }

      this.ctx.restore();
    }
  }

  drawTrails() {
    for (const [id, trail] of this.trails.entries()) {
      if (trail.length < 2) {
        continue;
      }

      this.ctx.save();
      this.ctx.strokeStyle = id === "left" ? "#35d07f" : "#59a9ff";
      this.ctx.lineWidth = 7;
      this.ctx.lineCap = "round";
      this.ctx.shadowColor = this.ctx.strokeStyle;
      this.ctx.shadowBlur = 18;
      this.ctx.beginPath();
      this.ctx.moveTo(trail[0].x, trail[0].y);

      for (let index = 1; index < trail.length; index += 1) {
        this.ctx.lineTo(trail[index].x, trail[index].y);
      }

      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  drawEffects() {
    for (const effect of this.effects) {
      const alpha = Math.max(0, effect.life / effect.maxLife);
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = effect.color;
      this.ctx.font = "700 26px Inter, system-ui, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.fillText(effect.label, effect.x, effect.y);
      this.ctx.restore();
    }
  }

  drawReadyOverlay() {
    this.ctx.save();
    this.ctx.fillStyle = "rgba(8, 13, 18, 0.38)";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#f7fafc";
    this.ctx.textAlign = "center";
    this.ctx.font = "700 26px Inter, system-ui, sans-serif";
    this.ctx.fillText("Press Start Game", this.canvas.width / 2, this.canvas.height / 2 - 18);
    this.ctx.font = "500 15px Inter, system-ui, sans-serif";
    this.ctx.fillStyle = "#c7d2df";
    this.ctx.fillText("Slash green targets with either hand. Avoid red hazards.", this.canvas.width / 2, this.canvas.height / 2 + 16);
    this.ctx.restore();
  }
}

function drawTarget(ctx, radius) {
  ctx.fillStyle = "rgba(53, 208, 127, 0.2)";
  ctx.strokeStyle = "#35d07f";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-radius * 0.62, 0);
  ctx.lineTo(radius * 0.62, 0);
  ctx.moveTo(0, -radius * 0.62);
  ctx.lineTo(0, radius * 0.62);
  ctx.stroke();
}

function drawHazard(ctx, radius) {
  ctx.fillStyle = "rgba(255, 90, 106, 0.22)";
  ctx.strokeStyle = "#ff5a6a";
  ctx.lineWidth = 4;
  ctx.beginPath();

  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.58;
    const x = Math.cos(angle) * pointRadius;
    const y = Math.sin(angle) * pointRadius;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function createEffect(x, y, color, label) {
  return {
    x,
    y,
    color,
    label,
    life: 760,
    maxLife: 760
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
