"""GoodBoy — render a demo reel from the fine-tuned model on real test dogs.

Runs the trained sit/down/stand model on held-out test images, draws a
GoodBoy-style box + "✓ SIT" badge, and saves PNGs + an animated GIF for the
landing-page hero. Proves the model works on real dogs without a live camera.

Run from the goodboy folder:
    spike/.venv/Scripts/python.exe -m app.demo_render
"""
import glob
import os

from PIL import Image, ImageDraw, ImageFont

from app.perception import Perception

HERE = os.path.dirname(__file__)
TEST_DIRS = [os.path.join(HERE, "..", "train", "dataset", "test"),
             os.path.join(HERE, "..", "train", "dataset", "valid")]
OUT = os.path.join(HERE, "demo_out")
ACCENT = (255, 107, 53)
GREEN = (63, 185, 80)
PER_CLASS = 3


def _font(size):
    for p in (r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\arial.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def annotate(img, label, conf):
    img = img.convert("RGB")
    W, H = img.size
    scale = max(W, H) / 720
    d = ImageDraw.Draw(img)
    big = _font(int(34 * scale))
    small = _font(int(20 * scale))
    # badge
    txt = f"✓ {label.upper()}  {conf:.0%}"
    tb = d.textbbox((0, 0), txt, font=big)
    bw, bh = tb[2] - tb[0], tb[3] - tb[1]
    pad = int(16 * scale)
    d.rounded_rectangle([pad, pad, pad + bw + 2 * pad, pad + bh + 2 * pad],
                        radius=int(12 * scale), fill=GREEN)
    d.text((pad + pad, pad + pad - tb[1]), txt, font=big, fill=(10, 20, 12))
    # watermark
    wm = "🐕 GoodBoy"
    d.text((pad, H - int(38 * scale)), wm, font=small, fill=ACCENT)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    p = Perception(weights="auto", optimize=False, threshold=0.4)
    print(f"[demo] mode={p.mode} weights={p.weights}")

    test_dir = next((d for d in TEST_DIRS
                     if os.path.isdir(d) and glob.glob(os.path.join(d, "*.jpg"))), None)
    if not test_dir:
        print("[demo] no test images found")
        return
    imgs = sorted(glob.glob(os.path.join(test_dir, "*.jpg")))
    print(f"[demo] scanning {len(imgs)} test images from {os.path.basename(test_dir)}")

    chosen = []
    per = {"sit": 0, "down": 0, "stand": 0}
    for path in imgs:
        if len(chosen) >= PER_CLASS * 3:
            break
        img = Image.open(path)
        dets = p.predict(img)
        best = max((d for d in dets if d.label in per), key=lambda x: x.conf, default=None)
        if best and best.conf >= 0.55 and per.get(best.label, 99) < PER_CLASS:
            per[best.label] += 1
            frame = annotate(img, best.label, best.conf).resize((720, 480))
            out_png = os.path.join(OUT, f"{best.label}_{per[best.label]}.png")
            frame.save(out_png)
            chosen.append(frame)
            print(f"   {best.label:5} {best.conf:.2f}  <- {os.path.basename(path)}")

    if chosen:
        chosen[0].save(os.path.join(OUT, "demo.gif"), save_all=True,
                       append_images=chosen[1:], duration=1300, loop=0)
        print(f"[demo] wrote {len(chosen)} frames + demo.gif to {OUT}")
    else:
        print("[demo] no confident frames selected")


if __name__ == "__main__":
    main()
