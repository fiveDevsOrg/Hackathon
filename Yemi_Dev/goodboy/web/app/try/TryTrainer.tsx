"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classify, loadModel, type Label } from "./model";

const COMMANDS: Label[] = ["sit", "down", "stand"];
const MATCH_CONF = 0.6;
const NEED_STABLE = 2;
const NODOG_CONF = 0.45;
const COMMAND_MS = 14000;

type Seeing = { label: Label; conf: number } | null;

export default function TryTrainer() {
  const [phase, setPhase] = useState<"intro" | "loading" | "ready">("intro");
  const [loadPct, setLoadPct] = useState(0);
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [err, setErr] = useState<string | null>(null);
  const [voiceOn, setVoiceOn] = useState(false);

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

  // upload state
  const [upImg, setUpImg] = useState<string | null>(null);
  const [upVerdict, setUpVerdict] = useState<{ label: Label; conf: number; scores: number[] } | null>(null);
  const [upBusy, setUpBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const runningRef = useRef(false);
  const cmdRef = useRef<Label>("sit");
  const stableRef = useRef(0);
  const deadlineRef = useRef(0);
  const streakRef = useRef(0);

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

  const ensureModel = useCallback(async () => {
    if (phase === "ready") return;
    setPhase("loading");
    try {
      await loadModel((f) => setLoadPct(f));
      setPhase("ready");
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
        const r = await classify(v);
        setSeeing({ label: r.label, conf: r.conf });
        const seesDog = r.conf >= NODOG_CONF;
        setNoDog(!seesDog);

        if (seesDog && r.label === cmdRef.current && r.conf >= MATCH_CONF) {
          stableRef.current += 1;
        } else {
          stableRef.current = 0;
        }
        setStable(stableRef.current);

        if (stableRef.current >= NEED_STABLE) {
          // success
          setScore((s) => s + 1);
          streakRef.current += 1;
          setStreak(streakRef.current);
          setBest((b) => Math.max(b, streakRef.current));
          setFlash("ok");
          say("Good boy!");
          setTimeout(() => setFlash(null), 700);
          pickCommand();
        } else if (Date.now() > deadlineRef.current) {
          // timeout -> miss
          streakRef.current = 0;
          setStreak(0);
          setFlash("no");
          setTimeout(() => setFlash(null), 700);
          pickCommand();
        }
      } catch {
        /* skip frame */
      }
    }
    if (runningRef.current) requestAnimationFrame(() => loop());
  }, [pickCommand, say]);

  const start = useCallback(async () => {
    setErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 960, height: 540 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setErr("Camera blocked. Allow camera access, or use the Upload tab.");
      return;
    }
    await ensureModel();
    setScore(0);
    setStreak(0);
    streakRef.current = 0;
    runningRef.current = true;
    setRunning(true);
    pickCommand();
    loop();
  }, [ensureModel, loop, pickCommand]);

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
      const url = URL.createObjectURL(file);
      setUpImg(url);
      try {
        await ensureModel();
        const img = new Image();
        img.src = url;
        await img.decode();
        const r = await classify(img);
        setUpVerdict(r);
      } catch {
        setErr("Inference failed on that image.");
      }
      setUpBusy(false);
    },
    [ensureModel],
  );

  useEffect(() => {
    return () => {
      runningRef.current = false;
      const v = videoRef.current;
      const s = v?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const suggestion = noDog
    ? "Point the camera at your dog (whole body in frame)."
    : stable > 0
      ? "Nice — hold it steady…"
      : seeing
        ? `Your dog looks like “${seeing.label}.” Cue a ${command}.`
        : "Get your dog in frame and cue the command.";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
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
              {flash && (
                <div
                  className="absolute inset-0 grid place-items-center text-[120px]"
                  style={{ color: flash === "ok" ? "#3fb950" : "#f0556d" }}
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
                // eslint-disable-next-line @next/next/no-img-element
                <img src={upImg} alt="your dog" className="max-h-full max-w-full rounded-lg object-contain" />
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

        {err && <p className="mt-3 text-sm text-[#f0556d]">{err}</p>}

        {mode === "camera" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!running ? (
              <button onClick={resume} disabled={phase !== "ready"} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone disabled:opacity-40 hover:border-white/30">▶ Resume</button>
            ) : (
              <button onClick={pause} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone hover:border-white/30">⏸ Pause</button>
            )}
            <button onClick={skip} disabled={!running} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone disabled:opacity-40 hover:border-white/30">⏭ Skip command</button>
            <button onClick={() => { setScore(0); setStreak(0); streakRef.current = 0; }} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-bone hover:border-white/30">↺ Reset score</button>
            <button onClick={() => setVoiceOn((v) => !v)} className={`rounded-lg border px-4 py-2 text-sm ${voiceOn ? "border-ember/40 text-ember-300" : "border-white/15 text-muted"}`}>{voiceOn ? "🔊 Voice on" : "🔇 Voice off"}</button>
          </div>
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
                {Array.from({ length: NEED_STABLE }).map((_, i) => (
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
          </>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-ink-800/50 p-6">
            {upBusy ? (
              <p className="text-center text-muted">Analyzing…</p>
            ) : upVerdict ? (
              <>
                <div className="text-center">
                  <div className="font-mono text-xs uppercase tracking-[0.16em] text-ember-300">GoodBoy says</div>
                  <div className="my-1 font-display text-5xl font-extrabold text-bone">{upVerdict.label.toUpperCase()}</div>
                  <div className="text-muted">{Math.round(upVerdict.conf * 100)}% confident</div>
                </div>
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
              </>
            ) : (
              <p className="text-center text-muted">Upload a photo of your dog to get an instant sit / down / stand verdict.</p>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted/70">
          Same model as the full product · 95% posture accuracy · 100% on-device
        </p>
      </div>
    </div>
  );
}
