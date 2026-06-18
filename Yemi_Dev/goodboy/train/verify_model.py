"""Verify the fine-tuned model: raw class-id -> ground-truth mapping + accuracy."""
import collections
import glob
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from PIL import Image
from rfdetr import RFDETRNano

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, "output", "checkpoint_best_ema.pth")
TEST = os.path.join(HERE, "dataset", "test")

ann = json.load(open(os.path.join(TEST, "_annotations.coco.json"), encoding="utf-8"))
cat = {c["id"]: c["name"] for c in ann["categories"]}
imgs = {im["id"]: im["file_name"] for im in ann["images"]}
gt = {imgs[a["image_id"]]: cat[a["category_id"]] for a in ann["annotations"]}
print("categories (json):", cat)

model = RFDETRNano(pretrain_weights=CKPT)
pairs = collections.Counter()   # (raw_class_id, gt_name)
nodet = 0
for fn, g in gt.items():
    det = model.predict(Image.open(os.path.join(TEST, fn)), threshold=0.3)
    if len(det) == 0:
        nodet += 1
        continue
    i = max(range(len(det)), key=lambda k: det.confidence[k])
    pairs[(int(det.class_id[i]), g)] += 1

print(f"\nraw_class_id -> ground_truth (count), over {len(gt)} test imgs, no-det {nodet}:")
for (cid, g), n in sorted(pairs.items()):
    print(f"   class_id {cid:>2}  ==  {g:<6}  x{n}")

# infer the dominant mapping
by_id = collections.defaultdict(collections.Counter)
for (cid, g), n in pairs.items():
    by_id[cid][g] += n
print("\ninferred mapping:", {cid: c.most_common(1)[0][0] for cid, c in by_id.items()})
correct = sum(n for (cid, g), n in pairs.items()
              if by_id[cid].most_common(1)[0][0] == g)
print(f"posture accuracy (top-1): {correct}/{sum(pairs.values())} "
      f"= {100*correct/max(sum(pairs.values()),1):.1f}%")
