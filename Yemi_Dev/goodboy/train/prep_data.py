"""GoodBoy — build a sit/down/stand DETECTION dataset, auto-labeled with RF-DETR.

Source: stockeh/dog-pose-cv (Apache-2.0) — per-image pose labels (sitting/
standing/lying). We download it (no Roboflow key needed), run PRETRAINED
RF-DETR to find each dog's bounding box, and attach the pose label as the
class. Output: a COCO dataset at train/dataset/{train,valid,test}/.

Run:
    set PER_CLASS=700 & ..\spike\.venv\Scripts\python.exe prep_data.py
"""
import collections
import io
import json
import os
import random
import sys
import tarfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from huggingface_hub import hf_hub_download
from PIL import Image
from rfdetr import RFDETRNano

REPO = "stockeh/dog-pose-cv"
OUT = os.path.join(os.path.dirname(__file__), "dataset")
PER_CLASS = int(os.environ.get("PER_CLASS", "700"))
SEED = 1234
CONF = 0.5
LABEL_MAP = {"sitting": "sit", "lying": "down", "standing": "stand"}
CATS = ["sit", "down", "stand"]
CAT_ID = {c: i + 1 for i, c in enumerate(CATS)}  # sit=1, down=2, stand=3


def coco_names():
    try:
        from rfdetr.util.coco_classes import COCO_CLASSES
    except Exception:
        return lambda i: f"class_{i}"
    if isinstance(COCO_CLASSES, dict):
        return lambda i: COCO_CLASSES.get(i, f"class_{i}")
    return lambda i: COCO_CLASSES[i] if 0 <= i < len(COCO_CLASSES) else f"class_{i}"


def load_labels():
    p = hf_hub_download(REPO, "data/labels.tar.gz", repo_type="dataset")
    out = {}
    with tarfile.open(p) as t:
        for m in t.getmembers():
            base = m.name.split("/")[-1]
            if not (m.isfile() and base.endswith(".csv")) or base.startswith("._"):
                continue
            for line in t.extractfile(m).read().decode("utf-8", "replace").splitlines()[1:]:
                if "," not in line:
                    continue
                fid, lab = line.rsplit(",", 1)
                lab = lab.strip().lower()
                if lab in LABEL_MAP:
                    out[fid.strip()] = LABEL_MAP[lab]
    return out


def main():
    labels = load_labels()
    print(f"[labels] usable (sit/down/stand) images: {len(labels)}")

    by_class = collections.defaultdict(list)
    for fid, lab in labels.items():
        by_class[lab].append(fid)
    rng = random.Random(SEED)
    chosen = {}
    for lab, ids in by_class.items():
        rng.shuffle(ids)
        for fid in ids[:PER_CLASS]:
            chosen[fid] = lab
    print(f"[subset] PER_CLASS={PER_CLASS} -> {len(chosen)} images "
          f"{ {c: sum(1 for v in chosen.values() if v == c) for c in CATS} }")

    items = list(chosen)
    rng.shuffle(items)
    split_for = {}
    for i, fid in enumerate(items):
        r = i / len(items)
        split_for[fid] = "train" if r < 0.85 else ("valid" if r < 0.97 else "test")

    coco = {s: {"images": [], "annotations": [],
                "categories": [{"id": CAT_ID[c], "name": c, "supercategory": "dog"} for c in CATS]}
            for s in ("train", "valid", "test")}
    for s in coco:
        os.makedirs(os.path.join(OUT, s), exist_ok=True)
    img_id = {s: 0 for s in coco}
    ann_id = {s: 0 for s in coco}

    name_of = coco_names()
    model = RFDETRNano()

    ip = hf_hub_download(REPO, "data/images.tar.gz", repo_type="dataset")
    print(f"[images] streaming {ip}")
    kept = collections.Counter()
    nodog = seen = 0
    with tarfile.open(ip, "r|gz") as t:
        for m in t:
            base = m.name.split("/")[-1]
            if not (m.isfile() and base.lower().endswith(".jpg")):
                continue
            if base.startswith("._") or base not in chosen:
                continue
            seen += 1
            try:
                img = Image.open(io.BytesIO(t.extractfile(m).read())).convert("RGB")
            except Exception:
                continue
            det = model.predict(img, threshold=CONF)
            best = None
            for box, conf, cid in zip(det.xyxy, det.confidence, det.class_id):
                if name_of(int(cid)).lower() == "dog" and (best is None or float(conf) > best[1]):
                    best = (box, float(conf))
            if best is None:
                nodog += 1
                continue

            s = split_for[base]
            img.save(os.path.join(OUT, s, base), quality=90)
            W, H = img.size
            x1, y1, x2, y2 = [float(v) for v in best[0]]
            w, h = x2 - x1, y2 - y1
            iid = img_id[s]; img_id[s] += 1
            coco[s]["images"].append({"id": iid, "file_name": base, "width": W, "height": H})
            aid = ann_id[s]; ann_id[s] += 1
            lab = chosen[base]
            coco[s]["annotations"].append({
                "id": aid, "image_id": iid, "category_id": CAT_ID[lab],
                "bbox": [x1, y1, w, h], "area": w * h, "iscrowd": 0, "segmentation": []})
            kept[lab] += 1
            if seen % 200 == 0:
                print(f"   processed {seen} | kept {sum(kept.values())} | no-dog {nodog}")

    for s in coco:
        with open(os.path.join(OUT, s, "_annotations.coco.json"), "w", encoding="utf-8") as f:
            json.dump(coco[s], f)
    print(f"[done] kept {dict(kept)} | skipped(no dog) {nodog} | seen {seen}")
    for s in coco:
        print(f"   {s}: {len(coco[s]['images'])} images")


if __name__ == "__main__":
    main()
