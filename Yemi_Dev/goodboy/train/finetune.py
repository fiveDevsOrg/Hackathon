"""GoodBoy — fine-tune RF-DETR-Nano on the auto-labeled sit/down/stand dataset.

Run from the train/ folder (UTF-8 + wandb disabled to avoid console crashes):
    PYTHONIOENCODING=utf-8 WANDB_DISABLED=true ../spike/.venv/Scripts/python.exe finetune.py

Outputs checkpoints to train/output/ (checkpoint_best_*.pth for inference).
"""
import os

from rfdetr import RFDETRNano

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    model = RFDETRNano()
    model.train(
        dataset_dir=os.path.join(HERE, "dataset"),
        output_dir=os.path.join(HERE, "output"),
        epochs=int(os.environ.get("EPOCHS", "20")),
        batch_size=int(os.environ.get("BATCH", "8")),
        grad_accum_steps=int(os.environ.get("GRAD_ACCUM", "2")),
        lr=float(os.environ.get("LR", "1e-4")),
    )
    print("[finetune] done. checkpoints in train/output/")


if __name__ == "__main__":
    main()
