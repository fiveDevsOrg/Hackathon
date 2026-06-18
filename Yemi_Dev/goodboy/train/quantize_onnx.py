"""Quantize the ONNX to int8 for a small browser download, then verify accuracy."""
import glob
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import numpy as np
import onnxruntime as ort
from onnxruntime.quantization import QuantType, quantize_dynamic
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "export", "rfdetr-nano.onnx")
DST = os.path.join(HERE, "export", "rfdetr-nano-int8.onnx")
TEST = os.path.join(HERE, "dataset", "test")
LABELS = {0: "sit", 1: "down", 2: "stand"}

print("[quant] quantizing (dynamic, QUInt8) ...")
quantize_dynamic(SRC, DST, weight_type=QuantType.QUInt8)
print(f"[quant] fp32 {os.path.getsize(SRC)//1024//1024} MB -> int8 {os.path.getsize(DST)//1024//1024} MB")

# verify
sess = ort.InferenceSession(DST, providers=["CPUExecutionProvider"])
inp = sess.get_inputs()[0].name
on = [o.name for o in sess.get_outputs()]
li = on.index("labels")
mean = np.array([0.485, 0.456, 0.406], np.float32)
std = np.array([0.229, 0.224, 0.225], np.float32)
ann = json.load(open(os.path.join(TEST, "_annotations.coco.json"), encoding="utf-8"))
cat = {c["id"]: c["name"] for c in ann["categories"]}
imgs = {im["id"]: im["file_name"] for im in ann["images"]}
gt = {imgs[a["image_id"]]: cat[a["category_id"]] for a in ann["annotations"]}

paths = sorted(glob.glob(os.path.join(TEST, "*.jpg")))
correct = 0
for p in paths:
    img = Image.open(p).convert("RGB").resize((384, 384))
    x = ((np.asarray(img, np.float32) / 255.0 - mean) / std).transpose(2, 0, 1)[None].astype(np.float32)
    logits = sess.run(None, {inp: x})[li][0]
    cls = (1 / (1 + np.exp(-logits)))[:, :3]
    ci = int(cls[int(cls.max(1).argmax())].argmax())
    correct += LABELS[ci] == gt.get(os.path.basename(p), "?")
print(f"[quant] int8 accuracy on test set: {correct}/{len(paths)} = {100*correct/len(paths):.1f}%")
