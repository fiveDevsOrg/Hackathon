"""Export the fine-tuned RF-DETR to ONNX (for in-browser / onnxruntime-web).

This gates the "test online without a local server" feature: if the model
exports to standard ONNX ops, we can run it client-side on the Vercel site.
"""
import os
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from rfdetr import RFDETRNano

HERE = os.path.dirname(os.path.abspath(__file__))
CKPT = os.path.join(HERE, "output", "checkpoint_best_ema.pth")
OUT = os.path.join(HERE, "export")


def main():
    os.makedirs(OUT, exist_ok=True)
    model = RFDETRNano(pretrain_weights=CKPT, num_classes=3)
    print("[export] starting ONNX export ...")
    try:
        model.export(output_dir=OUT)
    except TypeError:
        model.export()  # older signature: writes to ./output
    print("[export] done. files:")
    for root, _, files in os.walk(OUT):
        for f in files:
            p = os.path.join(root, f)
            print(f"   {p}  ({os.path.getsize(p)//1024} KB)")


if __name__ == "__main__":
    main()
