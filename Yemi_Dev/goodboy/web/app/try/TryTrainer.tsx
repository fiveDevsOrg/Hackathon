"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeBackend, classify, classifyAll, loadModel, type Detection, type Label } from "./model";
import CheckoutButton from "../components/CheckoutButton";
import { ev } from "../lib/analytics";

const COMMANDS: Label[] = ["sit", "down", "stand"];
const NODOG_CONF = 0.45;
const COMMAND_MS = 14000;
const SHARE_URL = "https://goodboy-alpha.vercel.app/try";

type Sensitivity = "easy" | "normal" | "hard";
const SENSITIVITY: Record<Sensitivity, { conf: number; stable: number; label: string }> = {
  easy: { conf: 0.5, stable: 1, label: "Easy" },
  normal: { conf: 0.6, stable: 2, label: "Normal" },
  hard: { conf: 0.72, stable: 3, label: "Hard" },
};

type Seeing = { label: Label; conf: number } | null;

// Badge catalog: id -> { emoji, title }
const BADGES = {
  first: { emoji: "🥉", title: "First correct" },
  streak5: { emoji: "🥈", title: "5-streak" },
  streak10: { emoji: "🥇", title: "10-streak" },
  reps25: { emoji: "🏆", title: "25 total reps" },
} as const;
type BadgeId = keyof typeof BADGES;

export default function TryTrainer() {
  const [phase, setPhase] = useState<"intro" | "loading" | "ready">("intro");
  const [loadPct, setLoadPct] = useState(0);
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [err, setErr] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [engine, setEngine] = useState("");

  // training-loop state surfaced to the UI
  const [running, setRunning] = useState(false);
  const [command, setCommand] = useState<Label>("sit");
  const [seeing, setSeeing] = useState<Seeing>(null);
  const [stable, setStable] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [flash, setFlash] = useState<"ok" | "no" | null>(null);
  const [noDog, setNoDog] = useState(false);

  // sensitivity (persisted)
  const [sensitivity, setSensitivity] = useState<Sensitivity>("normal");

  // persisted lifetime stats + badges
  const [bestEver, setBestEver] = useState(0);
  const [reps, setReps] = useState(0);
  const [badges, setBadges] = useState<BadgeId[]>([]);

  // session deposit-CTA bridge
  const [sessionWins, setSessionWins] = useState(0);
  const [ctaShown, setCtaShown] = useState(false);
  const [ctaDismissed, setCtaDismissed] = useState(false);

  // share affordance
  const [copied, setCopied] = useState(false);

  // upload state
  const [upImg, setUpImg] = useState<string | null>(null);
  const [upVerdict, setUpVerdict] = useState<{ label: Label; conf: number; scores: number[] } | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upDets, setUpDets] = useState<Detection[]>([]);

  // RF-DETR showcase: live performance HUD + multi-dog count
  const [perfMs, setPerfMs] = useState(0);
  const [dogCount, setDogCount] = useState(0);

  // auto-captured "best moment" proof (most recent success only)
  const [proof, setProof] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // detection-box overlay canvases (camera + upload)
  const camCanvasRef = useRef<HTMLCanvasElement>(null);
  const upCanvasRef = useRef<HTMLCanvasElement>(null);
  const upImgRef = useRef<HTMLImageElement>(null);
  // latest live detections, read inside the rAF/timeout loop (avoid stale closure)
  const detsRef = useRef<Detection[]>([]);
  const runningRef = useRef(false);
  const cmdRef = useRef<Label>("sit");
  const stableRef = useRef(0);
  const deadlineRef = useRef(0);
  const streakRef = useRef(0);

  // refs read inside the rAF/timeout loop (avoid stale closures)
  const sensRef = useRef<Sensitivity>("normal");
  const sessionWinsRef = useRef(0);
  const repsRef = useRef(0);
  const bestEverRef = useRef(0);
  const badgesRef = useRef<BadgeId[]>([]);

  // lazily-created AudioContext for success/miss cues
  const audioCtxRef = useRef<AudioContext | null>(null);
  // tracks whether we've fired the once-per-visit "first_verdict" analytics event
  const firstVerdictRef = useRef(false);

  const say = useCallback(
    (t: string) => {
      if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) return;
      const u = new SpeechSynthesisUtterance(t);
      u.rate = 0.95;
      u.pitch = 1.05;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    },
    [voiceOn],
  );

  // ----- detection-box overlay (Features 1 & 2) -----
  // Draws RF-DETR's actual boxes over the media. Maps normalized boxes through
  // the object-contain letterbox. `matchLabel` (camera mode) colors the box
  // green when the detection equals the current command, ember otherwise.
  const drawBoxes = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      media: HTMLVideoElement | HTMLImageElement | null,
      dets: Detection[],
      matchLabel: Label | null,
    ) => {
      if (!canvas || !media) return;
      const rect = canvas.getBoundingClientRect();
      const EW = rect.width;
      const EH = rect.height;
      if (EW < 1 || EH < 1) return;

      // intrinsic media size
      const mW = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const mH = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;

      // size the backing store for crisp lines on HiDPI, clear each frame
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      if (canvas.width !== Math.round(EW * dpr) || canvas.height !== Math.round(EH * dpr)) {
        canvas.width = Math.round(EW * dpr);
        canvas.height = Math.round(EH * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, EW, EH);
      if (!mW || !mH || dets.length === 0) return;

      // letterbox mapping (media uses object-contain)
      const elemA = EW / EH;
      const mediaA = mW / mH;
      let dW: number, dH: number, oX: number, oY: number;
      if (mediaA > elemA) {
        dW = EW;
        dH = EW / mediaA;
        oX = 0;
        oY = (EH - dH) / 2;
      } else {
        dH = EH;
        dW = EH * mediaA;
        oY = 0;
        oX = (EW - dW) / 2;
      }
      const px = (nx: number) => oX + nx * dW;
      const py = (ny: number) => oY + ny * dH;

      for (const d of dets) {
        const x1 = px(d.box[0]);
        const y1 = py(d.box[1]);
        const x2 = px(d.box[2]);
        const y2 = py(d.box[3]);
        const w = Math.max(0, x2 - x1);
        const h = Math.max(0, y2 - y1);
        const color = matchLabel && d.label === matchLabel ? "#3fb950" : "#ff6b35";

        // 3px rounded rect
        const r = Math.min(10, w / 2, h / 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x1, y1, w, h, r);
        } else {
          ctx.moveTo(x1 + r, y1);
          ctx.arcTo(x2, y1, x2, y2, r);
          ctx.arcTo(x2, y2, x1, y2, r);
          ctx.arcTo(x1, y2, x1, y1, r);
          ctx.arcTo(x1, y1, x2, y1, r);
          ctx.closePath();
        }
        ctx.stroke();

        // label chip "SIT 92%" at top-left
        const text = `${d.label.toUpperCase()} ${Math.round(d.conf * 100)}%`;
        ctx.font = "600 12px ui-monospace, SFMono-Regular, Menlo, monospace";
        const padX = 6;
        const chipH = 18;
        const tw = ctx.measureText(text).width;
        const chipY = y1 - chipH >= 0 ? y1 - chipH : y1;
        ctx.fillStyle = color;
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x1, chipY, tw + padX * 2, chipH, 4);
          ctx.fill();
        } else {
          ctx.fillRect(x1, chipY, tw + padX * 2, chipH);
        }
        ctx.fillStyle = "#0d1117";
        ctx.textBaseline = "middle";
        ctx.fillText(text, x1 + padX, chipY + chipH / 2 + 0.5);
      }
    },
    [],
  );

  // ----- auto-capture "best moment" (Feature 4) -----
  // On a rep success, snapshot the live frame at native resolution with the
  // winning box + a "✓ SIT" badge burned in. Returns a JPEG data URL.
  const captureProof = useCallback((det: Detection, cmd: Label): string | null => {
    const v = videoRef.current;
    if (!v) return null;
    const mW = v.videoWidth;
    const mH = v.videoHeight;
    if (!mW || !mH) return null;
    const cv = document.createElement("canvas");
    cv.width = mW;
    cv.height = mH;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    try {
      ctx.drawImage(v, 0, 0, mW, mH);
    } catch {
      return null;
    }
    // winning box in pixel space (det.box is normalized over the full frame)
    const x1 = det.box[0] * mW;
    const y1 = det.box[1] * mH;
    const x2 = det.box[2] * mW;
    const y2 = det.box[3] * mH;
    const w = Math.max(0, x2 - x1);
    const h = Math.max(0, y2 - y1);
    const lw = Math.max(3, Math.round(mW / 160));
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#3fb950";
    ctx.strokeRect(x1, y1, w, h);

    // "✓ SIT" badge at top-left of the box
    const text = `✓ ${cmd.toUpperCase()}`;
    const fontPx = Math.max(16, Math.round(mW / 28));
    ctx.font = `700 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    const padX = fontPx * 0.5;
    const chipH = fontPx * 1.5;
    const tw = ctx.measureText(text).width;
    const bx = x1;
    const by = y1 - chipH >= 0 ? y1 - chipH : y1;
    ctx.fillStyle = "#3fb950";
    ctx.fillRect(bx, by, tw + padX * 2, chipH);
    ctx.fillStyle = "#0d1117";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + padX, by + chipH / 2);

    try {
      return cv.toDataURL("image/jpeg", 0.85);
    } catch {
      return null;
    }
  }, []);

  // ----- persisted state: hydrate once on mount -----
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const s = localStorage.getItem("gb_sensitivity") as Sensitivity | null;
      if (s && s in SENSITIVITY) {
        setSensitivity(s);
        sensRef.current = s;
      }
      const b = Number(localStorage.getItem("gb_best") || 0);
      if (Number.isFinite(b) && b > 0) {
        setBestEver(b);
        bestEverRef.current = b;
      }
      const r = Number(localStorage.getItem("gb_reps") || 0);
      if (Number.isFinite(r) && r > 0) {
        setReps(r);
        repsRef.current = r;
      }
      const raw = localStorage.getItem("gb_badges");
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((x): x is BadgeId => typeof x === "string" && x in BADGES);
          setBadges(valid);
          badgesRef.current = valid;
        }
      }
    } catch {
      /* localStorage unavailable / corrupt — ignore */
    }
  }, []);

  // persist sensitivity whenever it changes (and keep the ref in sync)
  const changeSensitivity = useCallback((s: Sensitivity) => {
    setSensitivity(s);
    sensRef.current = s;
    try {
      localStorage.setItem("gb_sensitivity", s);
    } catch {
      /* ignore */
    }
  }, []);

  // ----- audio cues (lazy AudioContext, created on a user gesture) -----
  const getAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        audioCtxRef.current = new AC();
      } catch {
        return null;
      }
    }
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }, []);

  const tone = useCallback(
    (freq: number, start: number, dur: number, gain: number, type: OscillatorType = "sine") => {
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    [],
  );

  const cueSuccess = useCallback(() => {
    if (getAudioCtx()) {
      // pleasant two-tone "ding" (C6 -> E6)
      tone(1046.5, 0, 0.18, 0.18, "sine");
      tone(1318.5, 0.1, 0.22, 0.16, "sine");
    }
    try {
      navigator.vibrate?.(60);
    } catch {
      /* ignore */
    }
  }, [getAudioCtx, tone]);

  const cueMiss = useCallback(() => {
    if (getAudioCtx()) {
      // soft low "buzz"
      tone(180, 0, 0.22, 0.1, "triangle");
    }
    try {
      navigator.vibrate?.(20);
    } catch {
      /* ignore */
    }
  }, [getAudioCtx, tone]);

  // ----- badge awarding (reads refs, persists, updates UI) -----
  const awardBadge = useCallback((id: BadgeId) => {
    if (badgesRef.current.includes(id)) return;
    const next = [...badgesRef.current, id];
    badgesRef.current = next;
    setBadges(next);
    try {
      localStorage.setItem("gb_badges", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  // ----- share -----
  const share = useCallback(
    async (text: string) => {
      ev("share_clicked");
      const data = { title: "GoodBoy", text, url: SHARE_URL };
      try {
        if (typeof navigator !== "undefined" && navigator.share) {
          await navigator.share(data);
          return;
        }
      } catch {
        /* user cancelled or share failed — fall through to copy */
      }
      try {
        await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } catch {
        /* clipboard blocked — nothing more we can do */
      }
    },
    [],
  );

  // share the captured proof as an image file where supported, else fall back
  // to the existing text share (Feature 4)
  const shareProof = useCallback(async () => {
    const text = `My dog just nailed it on GoodBoy 🐕 Try it free:`;
    const dataUrl = proof;
    if (dataUrl && typeof navigator !== "undefined" && navigator.canShare) {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], "goodboy-proof.jpg", { type: "image/jpeg" });
        if (navigator.canShare({ files: [file] })) {
          ev("share_clicked");
          await navigator.share({ files: [file], title: "GoodBoy", text, url: SHARE_URL });
          return;
        }
      } catch {
        /* file share unsupported or cancelled — fall back to text share */
      }
    }
    await share(text);
  }, [proof, share]);

  const ensureModel = useCallback(async () => {
    if (phase === "ready") return;
    setPhase("loading");
    try {
      await loadModel((f) => setLoadPct(f));
      setEngine(activeBackend);
      setPhase("ready");
      ev("model_loaded", { engine: activeBackend });
    } catch (e) {
      setErr("Could not load the model. Try a desktop browser (Chrome/Edge).");
      setPhase("intro");
      throw e;
    }
  }, [phase]);

  const pickCommand = useCallback(() => {
    const opts = COMMANDS.filter((c) => c !== cmdRef.current);
    const next = opts[Math.floor((Date.now() / 1000) % opts.length)];
    cmdRef.current = next;
    setCommand(next);
    stableRef.current = 0;
    setStable(0);
    deadlineRef.current = Date.now() + COMMAND_MS;
    say(`${next}!`);
  }, [say]);

  const loop = useCallback(async () => {
    if (!runningRef.current) return;
    const v = videoRef.current;
    if (v && v.readyState >= 2) {
      try {
        // sensitivity-driven thresholds, read from a ref so mid-session
        // changes take effect immediately (no stale closure)
        const { conf: matchConf, stable: needStable } = SENSITIVITY[sensRef.current];

        // One inference returns ALL confident detections (Feature 2). The
        // matchable threshold (min over no-dog floor & match conf) keeps the
        // box overlay populated while never relaxing the scoring gate below.
        const matchableThreshold = Math.min(NODOG_CONF, matchConf);
        const { dets, ms } = await classifyAll(v, matchableThreshold);

        // live performance HUD (Feature 3)
        setPerfMs(ms);

        // draw every detection box over the live video (Features 1 & 2)
        detsRef.current = dets;
        setDogCount(dets.length);
        drawBoxes(camCanvasRef.current, v, dets, cmdRef.current);

        // highest-confidence detection drives the existing scoring/verify logic
        const top = dets[0];
        const r = top
          ? { label: top.label, conf: top.conf }
          : { label: cmdRef.current, conf: 0 };
        setSeeing(top ? { label: top.label, conf: top.conf } : null);
        const seesDog = !!top && top.conf >= NODOG_CONF;
        setNoDog(!seesDog);

        // once-per-visit "first_verdict" — the first frame we actually
        // produce a confident read counts as the camera's first verdict
        if (!firstVerdictRef.current && top) {
          firstVerdictRef.current = true;
          ev("first_verdict", { mode: "camera" });
        }

        if (seesDog && r.label === cmdRef.current && r.conf >= matchConf) {
          stableRef.current += 1;
        } else {
          stableRef.current = 0;
        }
        setStable(stableRef.current);

        if (stableRef.current >= needStable && top) {
          // success — capture the winning frame as proof (Feature 4)
          const shot = captureProof(top, cmdRef.current);
          if (shot) setProof(shot);

          setScore((s) => s + 1);
          streakRef.current += 1;
          setStreak(streakRef.current);
          setBest((b) => Math.max(b, streakRef.current));
          setFlash("ok");
          say("Good boy!");
          cueSuccess();

          // session win bridge -> deposit CTA at 3
          sessionWinsRef.current += 1;
          setSessionWins(sessionWinsRef.current);

          // persisted lifetime reps + best-ever streak
          repsRef.current += 1;
          setReps(repsRef.current);
          try {
            localStorage.setItem("gb_reps", String(repsRef.current));
          } catch {
            /* ignore */
          }
          if (streakRef.current > bestEverRef.current) {
            bestEverRef.current = streakRef.current;
            setBestEver(bestEverRef.current);
            try {
              localStorage.setItem("gb_best", String(bestEverRef.current));
            } catch {
              /* ignore */
            }
          }

          // badges
          awardBadge("first");
          if (streakRef.current >= 5) awardBadge("streak5");
          if (streakRef.current >= 10) awardBadge("streak10");
          if (repsRef.current >= 25) awardBadge("reps25");

          setTimeout(() => setFlash(null), 700);
          pickCommand();
        } else if (Date.now() > deadlineRef.current) {
          // timeout -> miss
          streakRef.current = 0;
          setStreak(0);
          setFlash("no");
          cueMiss();
          setTimeout(() => setFlash(null), 700);
          pickCommand();
        }
      } catch {
        /* skip frame */
      }
    }
    // throttle (~4/s) — gives mobile GC room and avoids memory-pressure crashes
    if (runningRef.current) setTimeout(() => loop(), 240);
  }, [pickCommand, say, awardBadge, cueSuccess, cueMiss, drawBoxes, captureProof]);

  const start = useCallback(async () => {
    setErr(null);
    // warm up the AudioContext on this user gesture so cues can play later
    getAudioCtx();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setErr("Camera permission was blocked — allow it in your browser/site settings, or use the Upload tab.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setErr("No camera found — try the Upload tab.");
      } else if (name === "NotReadableError") {
        setErr("Your camera is in use by another app.");
      } else {
        setErr("Camera blocked. Allow camera access, or use the Upload tab.");
      }
      return;
    }
    await ensureModel();
    setScore(0);
    setStreak(0);
    streakRef.current = 0;
    setProof(null);
    setDogCount(0);
    detsRef.current = [];
    sessionWinsRef.current = 0;
    setSessionWins(0);
    setCtaShown(false);
    setCtaDismissed(false);
    runningRef.current = true;
    setRunning(true);
    ev("try_started");
    pickCommand();
    loop();
  }, [ensureModel, loop, pickCommand, getAudioCtx]);

  const pause = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
  }, []);

  const resume = useCallback(() => {
    if (phase !== "ready") return;
    runningRef.current = true;
    setRunning(true);
    deadlineRef.current = Date.now() + COMMAND_MS;
    loop();
  }, [loop, phase]);

  const skip = useCallback(() => pickCommand(), [pickCommand]);

  const onUpload = useCallback(
    async (file: File) => {
      setUpBusy(true);
      setUpVerdict(null);
      setUpDets([]);
      const url = URL.createObjectURL(file);
      setUpImg(url);
      try {
        await ensureModel();
        const img = new Image();
        img.src = url;
        await img.decode();
        const r = await classify(img);
        setUpVerdict(r);
        // all confident detections for box overlay + multi-dog listing
        const { dets } = await classifyAll(img, NODOG_CONF);
        setUpDets(dets);
        if (!firstVerdictRef.current) {
          firstVerdictRef.current = true;
          ev("first_verdict", { mode: "upload" });
        }
        ev("upload_verdict", { label: r.label });
      } catch {
        setErr("Inference failed on that image.");
      }
      setUpBusy(false);
    },
    [ensureModel],
  );

  // clears the uploaded photo + verdict, back to the dropzone
  const clearUpload = useCallback(() => {
    setUpImg((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setUpVerdict(null);
    setUpDets([]);
    setErr(null);
  }, []);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  // surface the deposit CTA once the pup nails 3 in a session
  useEffect(() => {
    if (sessionWins >= 3 && !ctaDismissed) setCtaShown(true);
  }, [sessionWins, ctaDismissed]);

  // redraw the upload box overlay when its detections / image change.
  // Two rAFs let the <img> lay out (naturalWidth + clientRect settle) first.
  useEffect(() => {
    if (mode !== "upload" || !upImg) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        drawBoxes(upCanvasRef.current, upImgRef.current, upDets, null);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mode, upImg, upDets, drawBoxes]);

  // keep both overlays aligned through layout/orientation changes by
  // redrawing from refs (no per-frame state needed)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      drawBoxes(camCanvasRef.current, videoRef.current, detsRef.current, cmdRef.current);
      drawBoxes(upCanvasRef.current, upImgRef.current, upDets, null);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [drawBoxes, upDets]);

  const suggestion = noDog
    ? "Point the camera at your dog (whole body in frame)."
    : stable > 0
      ? "Nice — hold it steady…"
      : seeing
        ? `Your dog looks like “${seeing.label}.” Cue a ${command}.`
        : "Get your dog in frame and cue the command.";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <style jsx>{`
        .gb-flash {
          animation: gb-pop 0.34s cubic-bezier(0.18, 0.9, 0.32, 1.4) both;
        }
        @keyframes gb-pop {
          0% {
            transform: scale(0.4);
            opacity: 0;
          }
          60% {
            transform: scale(1.08);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .gb-flash {
            animation: none;
          }
        }
      `}</style>
      {/* ---------------- stage ---------------- */}
      <div>
        <div className="mb-3 inline-flex rounded-full border border-white/10 bg-ink-800/60 p-1 text-sm">
          {(["camera", "upload"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                mode === m ? "bg-ember text-ink-900" : "text-muted hover:text-bone"
              }`}
            >
              {m === "camera" ? "📷 Live trainer" : "🖼️ Upload a photo"}
            </button>
          ))}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-black aspect-video">
          {mode === "camera" ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
              {/* RF-DETR detection boxes (Features 1 & 2) */}
              <canvas
                ref={camCanvasRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
                aria-hidden="true"
              />
              {/* live performance HUD (Feature 3) + multi-dog count (Feature 2) */}
              {running && (
                <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
                  {perfMs > 0 && (
                    <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] leading-none text-muted backdrop-blur-sm">
                      {Math.round(perfMs)}ms · {Math.round(1000 / perfMs)} fps · {engine || "—"} · 384²
                    </span>
                  )}
                  {dogCount > 1 && (
                    <span className="rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] leading-none text-ember-300 backdrop-blur-sm">
                      🐕×{dogCount} detected
                    </span>
                  )}
                </div>
              )}
              {flash && (
                <div
                  className="gb-flash absolute inset-0 grid place-items-center text-[120px]"
                  style={{ color: flash === "ok" ? "#3fb950" : "#f0556d" }}
                  aria-hidden="true"
                >
                  {flash === "ok" ? "✓" : "✗"}
                </div>
              )}
              {!running && phase !== "loading" && (
                <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center">
                  <div>
                    <p className="mb-4 text-muted">Free. Runs entirely in your browser — your video never leaves your device.</p>
                    <button
                      onClick={start}
                      className="rounded-full bg-ember px-7 py-3 font-semibold text-ink-900 hover:bg-ember-300"
                    >
                      ▶ Start free session
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="grid h-full place-items-center p-4">
              {upImg ? (
                <div className="relative inline-flex max-h-full max-w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={upImgRef}
                    src={upImg}
                    alt="your dog"
                    onLoad={() => drawBoxes(upCanvasRef.current, upImgRef.current, upDets, null)}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                  {/* RF-DETR detection boxes over the uploaded photo (Features 1 & 2) */}
                  <canvas
                    ref={upCanvasRef}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                    aria-hidden="true"
                  />
                </div>
              ) : (
                <label className="cursor-pointer rounded-xl border border-dashed border-white/20 px-8 py-12 text-center text-muted hover:border-ember/40">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
                  />
                  <div className="text-3xl">🐕</div>
                  <div className="mt-2 font-medium text-bone">Drop a photo of your dog</div>
                  <div className="text-sm">or tap to choose — sit, down, or stand</div>
                </label>
              )}
            </div>
          )}

          {phase === "loading" && (
            <div className="absolute inset-0 grid place-items-center bg-black/75 p-6 text-center">
              <div className="w-64">
                <p className="mb-2 text-sm text-bone">Loading the AI model (~34&nbsp;MB, one time)…</p>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-ember transition-all" style={{ width: `${Math.round(loadPct * 100)}%` }} />
                </div>
                <p className="mt-2 font-mono text-xs text-muted">{Math.round(loadPct * 100)}%</p>
              </div>
            </div>
          )}
        </div>

        {err && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[#f0556d]">{err}</p>
            {mode === "camera" && (
              <button
                onClick={() => {
                  setErr(null);
                  setMode("upload");
                }}
                aria-label="Switch to photo upload"
                className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-bone hover:border-white/30"
              >
                🖼️ Switch to Upload
              </button>
            )}
          </div>
        )}

        {mode === "camera" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!running ? (
                <button onClick={resume} disabled={phase !== "ready"} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone disabled:opacity-40 hover:border-white/30">▶ Resume</button>
              ) : (
                <button onClick={pause} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone hover:border-white/30">⏸ Pause</button>
              )}
              <button onClick={skip} disabled={!running} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone disabled:opacity-40 hover:border-white/30">⏭ Skip command</button>
              <button onClick={() => { setScore(0); setStreak(0); streakRef.current = 0; }} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone hover:border-white/30">↺ Reset score</button>
              <button onClick={() => setVoiceOn((v) => !v)} className={`rounded-lg border px-4 py-2 text-sm ${voiceOn ? "border-ember/40 text-ember-300" : "border-white/15 text-muted"}`}>{voiceOn ? "🔊 Voice on" : "🔇 Voice off"}</button>
              {best > 0 && (
                <button
                  onClick={() => share(`My dog scored a ${Math.max(best, bestEver)}-streak on GoodBoy 🐕 Try it free:`)}
                  aria-label="Share your result"
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone hover:border-white/30"
                >
                  {copied ? "✓ Copied!" : "🔗 Share"}
                </button>
              )}
            </div>

            {/* sensitivity slider */}
            <div className="mt-3 rounded-xl border border-white/10 bg-ink-800/50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Sensitivity</span>
                <span className="font-mono text-xs text-ember-300">{SENSITIVITY[sensitivity].label}</span>
              </div>
              <div role="radiogroup" aria-label="Match sensitivity" className="inline-flex w-full overflow-hidden rounded-lg border border-white/10">
                {(["easy", "normal", "hard"] as const).map((s) => (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={sensitivity === s}
                    aria-label={`${SENSITIVITY[s].label} sensitivity`}
                    onClick={() => changeSensitivity(s)}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                      sensitivity === s ? "bg-ember text-ink-900" : "text-muted hover:text-bone"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">Easy helps young/distracted dogs; Hard rewards a crisp pose.</p>
            </div>
          </>
        )}
      </div>

      {/* ---------------- panel ---------------- */}
      <div className="flex flex-col gap-4">
        {mode === "camera" ? (
          <>
            <div className="rounded-2xl border border-ember/30 bg-gradient-to-br from-ember/10 to-ink-800 p-6 text-center">
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-ember-300">Tell your dog to</div>
              <div className="my-1 font-display text-6xl font-extrabold text-bone">{command.toUpperCase()}</div>
            </div>

            {/* verification HUD */}
            <div className="rounded-2xl border border-white/10 bg-ink-800/50 p-5">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-muted">Model sees</span>
                <span className="font-mono text-bone">{seeing ? `${seeing.label} ${Math.round(seeing.conf * 100)}%` : "—"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${Math.round((seeing?.conf ?? 0) * 100)}%`,
                    background: seeing?.label === command ? "#3fb950" : "#ff6b35",
                  }}
                />
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                {Array.from({ length: SENSITIVITY[sensitivity].stable }).map((_, i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${i < stable ? "bg-leaf" : "bg-white/10"}`} />
                ))}
                <span className="ml-2 font-mono text-xs text-muted">lock-in</span>
              </div>
              <p className={`mt-3 text-sm ${noDog ? "text-[#d2a24c]" : "text-muted"}`}>{suggestion}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[["Score", score], ["Streak", streak], ["Best", best]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl border border-white/10 bg-ink-800/50 p-3 text-center">
                  <div className="font-display text-2xl font-bold text-bone">{v}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted">{k}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-xs text-muted">
                Best ever: <span className="text-bone">{bestEver}</span>
                <span className="mx-2 text-white/15">·</span>
                Total reps: <span className="text-bone">{reps}</span>
              </span>
              {badges.length > 0 && (
                <div className="flex items-center gap-1.5" aria-label="Earned badges">
                  {badges.map((b) => (
                    <span key={b} title={BADGES[b].title} aria-label={BADGES[b].title} className="text-xl leading-none">
                      {BADGES[b].emoji}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* auto-captured "best moment" proof (Feature 4) */}
            {proof && (
              <div className="flex items-center gap-3 rounded-2xl border border-leaf/30 bg-ink-800/50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proof}
                  alt="Captured proof of your dog's last correct rep"
                  className="max-h-[140px] w-auto rounded-lg border border-white/10"
                  style={{ maxWidth: 140 }}
                />
                <div className="flex flex-col gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-leaf">📸 Proof</span>
                  <div className="flex flex-wrap gap-2">
                    <a
                      download="goodboy-proof.jpg"
                      href={proof}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-bone hover:border-white/30"
                    >
                      ⬇ Save
                    </a>
                    <button
                      onClick={() => shareProof()}
                      aria-label="Share your proof photo"
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-bone hover:border-white/30"
                    >
                      {copied ? "✓ Copied!" : "🔗 Share"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* deposit CTA bridge — appears after 3 wins this session */}
            {ctaShown && !ctaDismissed && (
              <div className="relative rounded-2xl border border-ember/40 bg-gradient-to-br from-ember/15 to-ink-800 p-5">
                <button
                  onClick={() => {
                    setCtaDismissed(true);
                    setCtaShown(false);
                  }}
                  aria-label="Dismiss founding-access offer"
                  className="absolute right-3 top-3 text-muted hover:text-bone"
                >
                  ✕
                </button>
                <p className="pr-6 text-bone">🎉 Your pup&apos;s a natural — lock founding access, $6/mo for life</p>
                <CheckoutButton className="mt-3 inline-flex rounded-full bg-ember px-5 py-2 text-sm font-semibold text-ink-900 hover:bg-ember-300">
                  Lock founding access →
                </CheckoutButton>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-ink-800/50 p-6">
            {upBusy ? (
              <p className="text-center text-muted">Analyzing…</p>
            ) : upVerdict ? (
              <>
                {upDets.length > 1 ? (
                  // multiple dogs detected (Feature 2): list each
                  <div className="text-center">
                    <div className="font-mono text-xs uppercase tracking-[0.16em] text-ember-300">
                      🐕×{upDets.length} detected
                    </div>
                    <p className="mt-2 text-bone">
                      {upDets
                        .map((d, i) => `Dog ${i + 1}: ${d.label} ${Math.round(d.conf * 100)}%`)
                        .join(" · ")}
                    </p>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="font-mono text-xs uppercase tracking-[0.16em] text-ember-300">GoodBoy says</div>
                    <div className="my-1 font-display text-5xl font-extrabold text-bone">{upVerdict.label.toUpperCase()}</div>
                    <div className="text-muted">{Math.round(upVerdict.conf * 100)}% confident</div>
                  </div>
                )}
                <div className="mt-5 space-y-2">
                  {COMMANDS.map((c, i) => (
                    <div key={c} className="flex items-center gap-3">
                      <span className="w-12 font-mono text-xs uppercase text-muted">{c}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-ember" style={{ width: `${Math.round(upVerdict.scores[i] * 100)}%` }} />
                      </div>
                      <span className="w-10 text-right font-mono text-xs text-muted">{Math.round(upVerdict.scores[i] * 100)}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    onClick={clearUpload}
                    aria-label="Try another photo"
                    className="rounded-lg border border-ember/40 px-4 py-2 text-sm font-medium text-ember-300 hover:bg-ember/10"
                  >
                    ↻ Try another photo
                  </button>
                  <button
                    onClick={() =>
                      share(`GoodBoy says my dog is doing "${upVerdict.label}" (${Math.round(upVerdict.conf * 100)}%) 🐕`)
                    }
                    aria-label="Share this verdict"
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone hover:border-white/30"
                  >
                    {copied ? "✓ Copied!" : "🔗 Share"}
                  </button>
                  <button
                    onClick={clearUpload}
                    aria-label="Clear photo"
                    className="ml-auto text-sm text-muted hover:text-bone"
                  >
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <p className="text-center text-muted">Upload a photo of your dog to get an instant sit / down / stand verdict.</p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted/70">
          Same model · 95% accuracy · on-device{engine ? ` · engine: ${engine}` : ""}
        </p>
      </div>
    </div>
  );
}
