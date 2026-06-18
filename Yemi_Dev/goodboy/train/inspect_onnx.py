"""Validate the exported ONNX in onnxruntime + print the I/O contract for JS."""
import glob
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import numpy as np
import onnxruntime as ort
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ONNX = os.path.join(HERE, "export", "rfdetr-nano.onnx")
TEST = os.path.join(HERE, "dataset", "test")
LABELS = {0: "sit", 1: "down", 2: "stand"}

sess = ort.InferenceSession(ONNX, providers=["CPUExecutionProvider"])
print("=== INPUTS ===")
for i in sess.get_inputs():
    print(f"  {i.name}  shape={i.shape}  type={i.type}")
print("=== OUTPUTS ===")
for o in sess.get_outputs():
    print(f"  {o.name}  shape={o.shape}  type={o.type}")

inp = sess.get_inputs()[0]
_, _, H, W = [d if isinstance(d, int) else 384 for d in inp.shape]
print(f"\nusing input size {W}x{H}")

# ground truth for a few test imgs
ann = json.load(open(os.path.join(TEST, "_annotations.coco.json"), encoding="utf-8"))
cat = {c["id"]: c["name"] for c in ann["categories"]}
imgs = {im["id"]: im["file_name"] for im in ann["images"]}
gt = {imgs[a["image_id"]]: cat[a["category_id"]] for a in ann["annotations"]}

mean = np.array([0.485, 0.456, 0.406], np.float32)
std = np.array([0.229, 0.224, 0.225], np.float32)


def pre(path):
    img = Image.open(path).convert("RGB").resize((W, H))
    x = (np.asarray(img, np.float32) / 255.0 - mean) / std
    return x.transpose(2, 0, 1)[None].astype(np.float32)


out_names = [o.name for o in sess.get_outputs()]
li = out_names.index("labels")  # class logits [1,300,C]
bi = out_names.index("dets")    # boxes        [1,300,4]
NUM_CLASSES = 3

paths = sorted(glob.glob(os.path.join(TEST, "*.jpg")))[:10]
correct = 0
for p in paths:
    out = sess.run(None, {inp.name: pre(p)})
    logits = out[li][0]                       # [300, C]
    probs = 1 / (1 + np.exp(-logits))         # sigmoid
    cls = probs[:, :NUM_CLASSES]              # only trained classes
    qi = int(cls.max(axis=1).argmax())        # best query
    ci = int(cls[qi].argmax())
    pred = LABELS.get(ci, f"id{ci}")
    g = gt.get(os.path.basename(p), "?")
    ok = pred == g
    correct += ok
    print(f"  {os.path.basename(p)[:22]:22} pred={pred:5} ({cls[qi, ci]:.2f})  gt={g:5} {'OK' if ok else 'x'}")
print(f"\nonnx sanity: {correct}/{len(paths)} match")
print(f"contract: input '{inp.name}' [1,3,{H},{W}] (ImageNet norm) -> "
      f"'labels' logits[1,300,{NUM_CLASSES}+] (sigmoid), 'dets' boxes[1,300,4]")
