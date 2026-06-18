"""Probe the ONNX 'dets' box format (normalized? cxcywh vs xyxy?) for overlay/multi-dog."""
import glob, json, os, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import numpy as np, onnxruntime as ort
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ONNX = os.path.join(HERE, "export", "rfdetr-nano-int8.onnx")
TEST = os.path.join(HERE, "dataset", "test")
sess = ort.InferenceSession(ONNX, providers=["CPUExecutionProvider"])
inp = sess.get_inputs()[0].name
on = [o.name for o in sess.get_outputs()]
li, di = on.index("labels"), on.index("dets")
mean = np.array([0.485, 0.456, 0.406], np.float32); std = np.array([0.229, 0.224, 0.225], np.float32)

p = sorted(glob.glob(os.path.join(TEST, "*.jpg")))[0]
W0, H0 = Image.open(p).size
img = Image.open(p).convert("RGB").resize((384, 384))
x = ((np.asarray(img, np.float32) / 255 - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
out = sess.run(None, {inp: x})
labels, dets = out[li][0], out[di][0]
probs = 1 / (1 + np.exp(-labels[:, :3]))
order = probs.max(1).argsort()[::-1][:3]
print("image (orig):", (W0, H0), " model input: 384x384")
print("dets global min/max:", round(float(dets.min()), 3), round(float(dets.max()), 3))
for q in order:
    print(f"  q{q} conf={probs[q].max():.2f} box(raw)={[round(float(v),3) for v in dets[q]]}")
