"""GoodBoy spike — does RF-DETR actually run and detect a dog on this machine?

Deterministic smoke test: downloads a sample dog photo, runs pretrained
RF-DETR (COCO), annotates detections, saves the result, and reports whether
a dog was found + how fast inference ran on the GPU.

This proves the FOUNDATION (RF-DETR installs, loads, runs on the GPU, detects
dogs). Posture classification (sit/down/stand) is the next step and needs
fine-tuning — it is NOT what this script tests.
"""
import io
import os
import time
import urllib.request

import supervision as sv
from PIL import Image

OUT_DIR = os.path.join(os.path.dirname(__file__), "output")
SAMPLE_URL = "https://media.roboflow.com/dog.jpeg"


def load_model():
    """Pick the smallest RF-DETR variant available in this install (Apache, <= Large)."""
    import rfdetr
    for name in ("RFDETRNano", "RFDETRSmall", "RFDETRBase", "RFDETRMedium", "RFDETRLarge"):
        cls = getattr(rfdetr, name, None)
        if cls is not None:
            print(f"[model] using {name}")
            return cls()
    available = [x for x in dir(rfdetr) if "RFDETR" in x]
    raise RuntimeError(f"No RFDETR* model class found. Available symbols: {available}")


def coco_names():
    """Return a callable id->name, tolerant of dict/list shapes across versions."""
    try:
        from rfdetr.util.coco_classes import COCO_CLASSES
    except Exception:
        return lambda i: f"class_{i}"
    if isinstance(COCO_CLASSES, dict):
        return lambda i: COCO_CLASSES.get(i, f"class_{i}")
    return lambda i: COCO_CLASSES[i] if 0 <= i < len(COCO_CLASSES) else f"class_{i}"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # --- environment / GPU sanity ---
    try:
        import torch
        dev = "cuda" if torch.cuda.is_available() else "cpu"
        gpu = torch.cuda.get_device_name(0) if dev == "cuda" else "CPU only"
        print(f"[env] torch {torch.__version__} | device={dev} | {gpu}")
    except Exception as e:
        print(f"[env] torch check failed: {e}")

    # --- load image ---
    print(f"[data] downloading {SAMPLE_URL}")
    raw = urllib.request.urlopen(SAMPLE_URL, timeout=30).read()
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    print(f"[data] image size = {image.size}")

    # --- load model + warmup ---
    model = load_model()
    name_of = coco_names()
    print("[model] warming up...")
    model.predict(image, threshold=0.5)  # first call compiles/initializes

    # --- timed inference ---
    t0 = time.perf_counter()
    detections = model.predict(image, threshold=0.5)
    ms = (time.perf_counter() - t0) * 1000
    n = len(detections)
    print(f"[infer] {n} detections in {ms:.1f} ms ({1000.0 / ms:.1f} FPS single-frame)")

    # --- report + did we find a dog? ---
    found_dog = False
    for box, conf, cid in zip(detections.xyxy, detections.confidence, detections.class_id):
        label = name_of(int(cid))
        if "dog" in str(label).lower():
            found_dog = True
        print(f"   - {label:<14} conf={conf:.2f}  box={[round(float(v)) for v in box]}")

    # --- annotate + save ---
    labels = [f"{name_of(int(c))} {p:.2f}" for c, p in zip(detections.class_id, detections.confidence)]
    annotated = image.copy()
    annotated = sv.BoxAnnotator().annotate(annotated, detections)
    annotated = sv.LabelAnnotator().annotate(annotated, detections, labels)
    out_path = os.path.join(OUT_DIR, "dog_annotated.jpg")
    annotated.save(out_path)
    print(f"[out] saved -> {out_path}")

    print("\n==== RESULT ====")
    print("DOG DETECTED [OK] - RF-DETR works on this machine." if found_dog
          else "No dog in detections [NONE] - check threshold/model.")
    return out_path, found_dog


if __name__ == "__main__":
    main()
