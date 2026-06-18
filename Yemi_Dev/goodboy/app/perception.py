"""Perception — the only unit that touches RF-DETR.

Loads the fine-tuned sit/down/stand checkpoint if present (else falls back to
the pretrained COCO model so the app still runs), optimizes for inference
(task A), and returns plain Detection objects.
"""
import glob
import os

from app.schema import Detection

# Fine-tuned class-id -> product label. The trained checkpoint returns
# 0-indexed ids (verified on the test set: 0=sit, 1=down, 2=stand, 95% acc).
CLASS_MAP = {0: "sit", 1: "down", 2: "stand"}

_TRAIN_OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "train", "output")


def find_weights():
    for c in ("checkpoint_best_total.pth", "checkpoint_best_ema.pth",
              "checkpoint_best_regular.pth", "checkpoint_best.pth", "checkpoint.pth"):
        p = os.path.join(_TRAIN_OUT, c)
        if os.path.exists(p):
            return p
    g = sorted(glob.glob(os.path.join(_TRAIN_OUT, "*.pth")))
    return g[-1] if g else None


class Perception:
    def __init__(self, weights="auto", optimize=True, threshold=0.45):
        from rfdetr import RFDETRNano
        self.threshold = threshold
        if weights == "auto":
            weights = find_weights()

        if weights and os.path.exists(weights):
            self.model = RFDETRNano(pretrain_weights=weights, num_classes=3)
            self.mode = "finetuned"
            self.weights = weights
            self._coco = None
        else:
            self.model = RFDETRNano()
            self.mode = "pretrained"
            self.weights = None
            self._coco = self._coco_names()

        self.optimized = False
        self.opt_error = None
        if optimize:
            try:
                self.model.optimize_for_inference()
                self.optimized = True
            except Exception as e:  # torch.compile/Windows can refuse; run unoptimized
                self.opt_error = str(e)

    def predict(self, pil_image):
        det = self.model.predict(pil_image, threshold=self.threshold)
        out = []
        for box, conf, cid in zip(det.xyxy, det.confidence, det.class_id):
            out.append(Detection(self._name(int(cid)), float(conf),
                                 tuple(float(v) for v in box)))
        return out

    def _name(self, cid):
        if self.mode == "finetuned":
            return CLASS_MAP.get(cid, f"id{cid}")
        return self._coco(cid)

    @staticmethod
    def _coco_names():
        try:
            from rfdetr.util.coco_classes import COCO_CLASSES
            if isinstance(COCO_CLASSES, dict):
                return lambda i: COCO_CLASSES.get(i, f"id{i}")
            return lambda i: COCO_CLASSES[i] if 0 <= i < len(COCO_CLASSES) else f"id{i}"
        except Exception:
            return lambda i: f"id{i}"
