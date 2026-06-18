"""GoodBoy spike — live webcam RF-DETR interface in the browser.

Run:
    ./.venv/Scripts/python.exe -m uvicorn webcam_app:app --host 127.0.0.1 --port 8000
Then open http://127.0.0.1:8000

Server-side webcam (cv2) -> RF-DETR per frame -> annotated MJPEG stream + a
/stats JSON the page polls for the live readout. Pretrained COCO model, so it
boxes the dog as "dog" (one class). Posture (sit/down) is the fine-tuning step.
"""
import time

import cv2
import supervision as sv
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from PIL import Image

# ---------------------------------------------------------------- model setup
def load_model():
    import rfdetr
    for name in ("RFDETRNano", "RFDETRSmall", "RFDETRBase", "RFDETRMedium", "RFDETRLarge"):
        cls = getattr(rfdetr, name, None)
        if cls is not None:
            print(f"[model] using {name}")
            return cls(), name
    raise RuntimeError("No RFDETR* model class found in rfdetr")


def coco_names():
    try:
        from rfdetr.util.coco_classes import COCO_CLASSES
    except Exception:
        return lambda i: f"class_{i}"
    if isinstance(COCO_CLASSES, dict):
        return lambda i: COCO_CLASSES.get(i, f"class_{i}")
    return lambda i: COCO_CLASSES[i] if 0 <= i < len(COCO_CLASSES) else f"class_{i}"


MODEL, MODEL_NAME = load_model()
NAME_OF = coco_names()
try:
    import torch
    DEVICE = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
except Exception:
    DEVICE = "?"

BOX = sv.BoxAnnotator(thickness=3)
LABEL = sv.LabelAnnotator(text_scale=0.6, text_thickness=1, text_padding=4)

STATE = {"fps": 0.0, "dets": [], "dog": False, "model": MODEL_NAME, "device": DEVICE}
CONF = 0.5

app = FastAPI(title="GoodBoy spike")


# ----------------------------------------------------------------- mjpeg feed
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
            det = MODEL.predict(Image.fromarray(rgb), threshold=CONF)

            labels = [f"{NAME_OF(int(c))} {p:.2f}"
                      for c, p in zip(det.class_id, det.confidence)]
            ann = BOX.annotate(rgb.copy(), det)
            ann = LABEL.annotate(ann, det, labels)
            ann = cv2.cvtColor(ann, cv2.COLOR_RGB2BGR)

            now = time.perf_counter()
            fps = 1.0 / max(now - last, 1e-6)
            last = now
            dets = [{"label": NAME_OF(int(c)), "conf": round(float(p), 2)}
                    for c, p in zip(det.class_id, det.confidence)]
            STATE.update(fps=round(fps, 1), dets=dets,
                         dog=any("dog" in d["label"].lower() for d in dets))

            ok2, buf = cv2.imencode(".jpg", ann, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ok2:
                continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                   + buf.tobytes() + b"\r\n")
    finally:
        cap.release()


@app.get("/video")
def video():
    return StreamingResponse(frames(),
                             media_type="multipart/x-mixed-replace; boundary=frame")


@app.get("/stats")
def stats():
    return JSONResponse(STATE)


@app.get("/", response_class=HTMLResponse)
def index():
    return HTML


# ------------------------------------------------------------------- frontend
HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GoodBoy — live RF-DETR</title><style>
:root{--bg:#0d1117;--card:#161b25;--line:#222b38;--ink:#e6edf3;--mut:#9aa7b8;--acc:#ff6b35;--grn:#3fb950}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(900px 500px at 70% -10%,rgba(255,107,53,.10),transparent),#0b0f16;color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:26px 22px 60px}
header{display:flex;align-items:center;gap:12px;margin-bottom:6px}
header .logo{font-size:30px}h1{font-size:24px;margin:0;letter-spacing:-.01em}
.sub{color:var(--mut);margin:2px 0 22px;font-size:14px}
.grid{display:grid;grid-template-columns:1fr 320px;gap:18px}@media(max-width:820px){.grid{grid-template-columns:1fr}}
.feed{background:#000;border:1px solid var(--line);border-radius:16px;overflow:hidden;position:relative;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center}
.feed img{width:100%;height:100%;object-fit:contain;display:block}
.feed .loading{position:absolute;color:var(--mut);font-size:14px}
.side{display:flex;flex-direction:column;gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.card h2{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:0 0 12px;font-weight:700}
.dogwrap{display:flex;align-items:center;gap:14px}
.dogdot{width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;background:#10151d;border:1px solid var(--line);transition:.2s}
.dogdot.on{background:rgba(63,185,80,.16);border-color:var(--grn);box-shadow:0 0 22px rgba(63,185,80,.3)}
.dogtxt b{font-size:16px}.dogtxt .s{color:var(--mut);font-size:13px}
.rowm{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}
.rowm:last-child{border-bottom:0}.rowm .k{color:var(--mut)}.rowm .v{font-family:ui-monospace,Consolas,monospace}
.fps{color:var(--acc);font-weight:700}
ul.dets{list-style:none;margin:0;padding:0}ul.dets li{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line);font-size:13px}
ul.dets li:last-child{border-bottom:0}ul.dets .lab{text-transform:capitalize}ul.dets .lab.dog{color:var(--grn);font-weight:700}
ul.dets .c{font-family:ui-monospace,monospace;color:var(--mut)}
.empty{color:var(--mut);font-size:13px;font-style:italic}
.note{color:var(--mut);font-size:12px;margin-top:14px;line-height:1.5}
.note b{color:var(--ink)}
</style></head><body><div class="wrap">
<header><span class="logo">🐕</span><h1>GoodBoy — live RF-DETR</h1></header>
<div class="sub">Point your webcam at yourself (or your dog). Boxes are drawn by RF-DETR in real time.</div>
<div class="grid">
  <div class="feed"><span class="loading">starting camera…</span><img src="/video" alt="live feed" onload="this.previousElementSibling.style.display='none'"></div>
  <div class="side">
    <div class="card"><h2>Detection</h2>
      <div class="dogwrap"><div class="dogdot" id="dogdot">🔍</div>
        <div class="dogtxt"><b id="dogstate">scanning…</b><div class="s" id="dogsub">looking for a dog</div></div></div>
    </div>
    <div class="card"><h2>Live stats</h2>
      <div class="rowm"><span class="k">FPS</span><span class="v fps" id="fps">—</span></div>
      <div class="rowm"><span class="k">Model</span><span class="v" id="model">—</span></div>
      <div class="rowm"><span class="k">Device</span><span class="v" id="device">—</span></div>
      <div class="rowm"><span class="k">Objects</span><span class="v" id="count">—</span></div>
    </div>
    <div class="card"><h2>Detections</h2><ul class="dets" id="dets"><li class="empty">none yet</li></ul></div>
  </div>
</div>
<div class="note"><b>What this proves:</b> RF-DETR runs live on your machine and detects objects (incl. <b>dog</b>) in real time. It uses the pretrained COCO model, so a dog is just "dog" — teaching it <b>sit / down / stand</b> is the fine-tuning step. That's the GoodBoy product.</div>
</div>
<script>
async function poll(){
  try{
    const s = await (await fetch('/stats')).json();
    document.getElementById('fps').textContent = s.fps ?? '—';
    document.getElementById('model').textContent = s.model ?? '—';
    document.getElementById('device').textContent = s.device ?? '—';
    document.getElementById('count').textContent = (s.dets||[]).length;
    const dot=document.getElementById('dogdot'), st=document.getElementById('dogstate'), sub=document.getElementById('dogsub');
    if(s.dog){dot.classList.add('on');dot.textContent='🐕';st.textContent='DOG DETECTED';sub.textContent='RF-DETR found a dog';}
    else{dot.classList.remove('on');dot.textContent='🔍';st.textContent='scanning…';sub.textContent='looking for a dog';}
    const ul=document.getElementById('dets');
    const d=(s.dets||[]).slice().sort((a,b)=>b.conf-a.conf);
    ul.innerHTML = d.length ? d.map(x=>`<li><span class="lab ${x.label.toLowerCase()==='dog'?'dog':''}">${x.label}</span><span class="c">${x.conf}</span></li>`).join('') : '<li class="empty">none yet</li>';
  }catch(e){}
  setTimeout(poll, 300);
}
poll();
</script>
</body></html>"""
