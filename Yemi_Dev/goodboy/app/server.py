"""GoodBoy trainer — the command-verify web app.

  webcam -> Perception(RF-DETR) -> StaticPostureRecognizer -> VerifierEngine -> UI

The app calls a command (SIT / DOWN / STAND), the dog performs it, RF-DETR
verifies the posture, and the scoreboard climbs. Run from the goodboy folder:

    spike/.venv/Scripts/python.exe -m uvicorn app.server:app --host 127.0.0.1 --port 8000
"""
import time

import cv2
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from PIL import Image

from app.engine import VerifierEngine
from app.perception import Perception
from app.recognizer import StaticPostureRecognizer

PERCEPTION = Perception(weights="auto", optimize=True, threshold=0.45)
RECOGNIZER = StaticPostureRecognizer(window=8, min_hits=5, min_conf=0.45)
ENGINE = VerifierEngine(commands=("sit", "down", "stand"), timeout=9.0, cooldown=2.2)
ENGINE.issue()

POSTURES = ("sit", "down", "stand")
LATEST = {"fps": 0.0, "recognized": None, "rec_stable": False,
          "mode": PERCEPTION.mode, "optimized": PERCEPTION.optimized,
          "weights": bool(PERCEPTION.weights)}

app = FastAPI(title="GoodBoy trainer")


def _draw(bgr, detections, target, rec):
    matched = rec is not None and rec.stable and rec.name == target
    for d in detections:
        if d.label not in POSTURES:
            continue
        x1, y1, x2, y2 = [int(v) for v in d.box]
        if d.label == target and matched:
            color = (105, 220, 90)      # green = verified
        elif d.label == target:
            color = (90, 200, 255)      # amber = right posture, not yet stable
        else:
            color = (150, 150, 150)
        cv2.rectangle(bgr, (x1, y1), (x2, y2), color, 3)
        tag = f"{d.label.upper()} {d.conf:.2f}"
        cv2.rectangle(bgr, (x1, y1 - 26), (x1 + 11 * len(tag), y1), color, -1)
        cv2.putText(bgr, tag, (x1 + 4, y1 - 7),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (20, 20, 20), 2)
    return bgr


def frames():
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 960)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 540)
    last = time.perf_counter()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            dets = PERCEPTION.predict(Image.fromarray(rgb))
            rec = RECOGNIZER.update(dets)
            ENGINE.handle(rec)
            ENGINE.tick()

            out = _draw(frame, dets, ENGINE.target, rec)  # draw on BGR frame
            now = time.perf_counter()
            LATEST["fps"] = round(1.0 / max(now - last, 1e-6), 1)
            last = now
            LATEST["recognized"] = rec.name if rec else None
            LATEST["rec_stable"] = bool(rec and rec.stable)

            ok2, buf = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if ok2:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                       + buf.tobytes() + b"\r\n")
    finally:
        cap.release()


@app.get("/video")
def video():
    return StreamingResponse(frames(),
                             media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/state")
def state():
    snap = ENGINE.snapshot()
    snap.update(fps=LATEST["fps"], recognized=LATEST["recognized"],
                rec_stable=LATEST["rec_stable"], mode=LATEST["mode"],
                optimized=LATEST["optimized"], finetuned=LATEST["weights"])
    return JSONResponse(snap)


@app.get("/", response_class=HTMLResponse)
def index():
    return HTML


HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GoodBoy — AI Dog Trainer</title><style>
:root{--bg:#0d1117;--card:#161b25;--line:#222b38;--ink:#e6edf3;--mut:#9aa7b8;--acc:#ff6b35;--grn:#3fb950;--red:#f0556d}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 480px at 70% -10%,rgba(255,107,53,.10),transparent),#0b0f16;color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1140px;margin:0 auto;padding:22px}
header{display:flex;align-items:center;gap:10px;margin-bottom:14px}.logo{font-size:26px}h1{font-size:20px;margin:0}
.badge{margin-left:auto;font-size:12px;color:var(--mut);border:1px solid var(--line);border-radius:20px;padding:4px 11px}
.grid{display:grid;grid-template-columns:1fr 340px;gap:16px}@media(max-width:840px){.grid{grid-template-columns:1fr}}
.feed{background:#000;border:1px solid var(--line);border-radius:16px;overflow:hidden;position:relative;aspect-ratio:16/9}
.feed img{width:100%;height:100%;object-fit:contain;display:block}
.verdict{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:140px;opacity:0;transition:opacity .15s;pointer-events:none}
.verdict.show{opacity:1}
.side{display:flex;flex-direction:column;gap:14px}
.cmd{background:linear-gradient(150deg,rgba(255,107,53,.16),var(--card));border:1px solid rgba(255,107,53,.32);border-radius:16px;padding:20px;text-align:center}
.cmd .lab{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--acc)}
.cmd .big{font-size:62px;font-weight:800;letter-spacing:-.02em;margin:4px 0 2px}
.cmd .hint{color:var(--mut);font-size:13px}
.score{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:14px 10px}
.score .m{text-align:center}.score .m .n{font-size:30px;font-weight:800}.score .m .k{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.n.grn{color:var(--grn)}.n.acc{color:var(--acc)}
.stat{display:flex;gap:8px;flex-wrap:wrap}.chip{font-size:11px;color:var(--mut);border:1px solid var(--line);border-radius:20px;padding:4px 10px}
.chip b{color:var(--ink)}
.start{width:100%;border:0;border-radius:12px;padding:13px;background:var(--acc);color:#1a1206;font-weight:800;font-size:15px;cursor:pointer}
.note{color:var(--mut);font-size:12px;line-height:1.5}
</style></head><body><div class="wrap">
<header><span class="logo">🐕</span><h1>GoodBoy — AI Dog Trainer</h1><span class="badge" id="modechip">loading…</span></header>
<div class="grid">
  <div class="feed"><img src="/video" alt="live feed"><div class="verdict" id="verdict"></div></div>
  <div class="side">
    <div class="cmd"><div class="lab">Tell your dog to</div><div class="big" id="cmd">—</div><div class="hint" id="hint">get your dog in frame</div></div>
    <button class="start" id="start">🔊 Start session (enables voice)</button>
    <div class="score">
      <div class="m"><div class="n grn" id="score">0</div><div class="k">Score</div></div>
      <div class="m"><div class="n" id="streak">0</div><div class="k">Streak</div></div>
      <div class="m"><div class="n" id="best">0</div><div class="k">Best</div></div>
      <div class="m"><div class="n acc" id="acc">0%</div><div class="k">Accuracy</div></div>
    </div>
    <div class="stat"><span class="chip">FPS <b id="fps">—</b></span><span class="chip" id="seeing">seeing: —</span></div>
    <div class="note">Point the camera at your dog. GoodBoy calls a command out loud, watches, and verifies the posture with RF-DETR. Get it right → ✓ + a point.</div>
  </div>
</div>
<script>
let voiceOn=false, lastCmd=null, lastResult=null, lastAttempts=-1;
const synth=window.speechSynthesis;
document.getElementById('start').onclick=()=>{voiceOn=true;say('Let\\'s train! '+(lastCmd||''));document.getElementById('start').textContent='🔊 Voice on';};
function say(t){ if(voiceOn&&synth){const u=new SpeechSynthesisUtterance(t);u.rate=.95;u.pitch=1.05;synth.cancel();synth.speak(u);} }
function ding(ok){try{const a=new (window.AudioContext||window.webkitAudioContext)();const o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=ok?880:200;o.type=ok?'sine':'square';g.gain.setValueAtTime(.001,a.currentTime);g.gain.exponentialRampToValueAtTime(.25,a.currentTime+.02);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+(ok?.5:.3));o.start();o.stop(a.currentTime+(ok?.5:.35));if(ok){o.frequency.setValueAtTime(1320,a.currentTime+.12);}}catch(e){}}
function flash(sym,color){const v=document.getElementById('verdict');v.textContent=sym;v.style.color=color;v.classList.add('show');setTimeout(()=>v.classList.remove('show'),700);}
async function poll(){
  try{
    const s=await (await fetch('/state')).json();
    const cmd=(s.command||'').toUpperCase();
    document.getElementById('cmd').textContent=cmd||'—';
    document.getElementById('score').textContent=s.score;
    document.getElementById('streak').textContent=s.streak;
    document.getElementById('best').textContent=s.best_streak;
    document.getElementById('acc').textContent=(s.accuracy||0)+'%';
    document.getElementById('fps').textContent=s.fps;
    document.getElementById('seeing').innerHTML='seeing: <b>'+(s.recognized?s.recognized:'—')+(s.rec_stable?' ✓':'')+'</b>';
    document.getElementById('modechip').textContent=(s.finetuned?'fine-tuned RF-DETR':'pretrained (not trained yet)')+(s.optimized?' · optimized':'');
    document.getElementById('hint').textContent=s.recognized?('your dog looks like: '+s.recognized):'get your dog in frame';
    if(cmd&&cmd!==lastCmd){lastCmd=cmd;say(s.command+'!');}
    if(s.attempts!==lastAttempts && s.last_result){
      lastAttempts=s.attempts;
      if(s.last_result==='success'){flash('✓','#3fb950');ding(true);say('Good boy!');}
      else{flash('✗','#f0556d');ding(false);}
    }
  }catch(e){}
  setTimeout(poll,200);
}
poll();
</script>
</body></html>"""
