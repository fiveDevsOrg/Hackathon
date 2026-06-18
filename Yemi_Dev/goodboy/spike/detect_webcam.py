"""GoodBoy spike — live RF-DETR on your webcam (run this with your dog in frame).

Proves the real-time product assumption: RF-DETR detecting a dog live on your
RTX 4080 at usable FPS. Press 'q' to quit.

Pretrained COCO model => it boxes the dog as "dog" (one class). Telling sit vs
down apart is the fine-tuning step; this just proves the live loop is smooth.
"""
import time

import cv2
import supervision as sv


def load_model():
    import rfdetr
    for name in ("RFDETRNano", "RFDETRSmall", "RFDETRBase", "RFDETRMedium", "RFDETRLarge"):
        cls = getattr(rfdetr, name, None)
        if cls is not None:
            print(f"[model] using {name}")
            return cls()
    raise RuntimeError("No RFDETR* model class found in rfdetr")


def coco_names():
    try:
        from rfdetr.util.coco_classes import COCO_CLASSES
    except Exception:
        return lambda i: f"class_{i}"
    if isinstance(COCO_CLASSES, dict):
        return lambda i: COCO_CLASSES.get(i, f"class_{i}")
    return lambda i: COCO_CLASSES[i] if 0 <= i < len(COCO_CLASSES) else f"class_{i}"


def main():
    from PIL import Image

    model = load_model()
    name_of = coco_names()
    box_an = sv.BoxAnnotator()
    label_an = sv.LabelAnnotator()

    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        raise RuntimeError("Could not open webcam (index 0)")

    print("[run] press 'q' in the window to quit")
    last = time.perf_counter()
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        detections = model.predict(Image.fromarray(rgb), threshold=0.5)

        labels = [f"{name_of(int(c))} {p:.2f}"
                  for c, p in zip(detections.class_id, detections.confidence)]
        annotated = box_an.annotate(rgb.copy(), detections)
        annotated = label_an.annotate(annotated, detections, labels)
        annotated = cv2.cvtColor(annotated, cv2.COLOR_RGB2BGR)

        now = time.perf_counter()
        fps = 1.0 / (now - last)
        last = now
        cv2.putText(annotated, f"{fps:.1f} FPS", (12, 32),
                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 0), 2)

        cv2.imshow("GoodBoy spike — RF-DETR live (q to quit)", annotated)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
