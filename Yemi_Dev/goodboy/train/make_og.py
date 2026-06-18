"""Compose a 1200x630 OG share image for GoodBoy from a real model output."""
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(HERE, "..", "web", "public")
W, H = 1200, 630
INK = (13, 17, 23)
EMBER = (255, 107, 53)
BONE = (230, 237, 243)
MUT = (154, 167, 184)


def font(sz, bold=True):
    for p in ([r"C:\Windows\Fonts\arialbd.ttf"] if bold else [r"C:\Windows\Fonts\arial.ttf"]):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


img = Image.new("RGB", (W, H), INK)
d = ImageDraw.Draw(img)

# ember glow top-right
glow = Image.new("RGB", (W, H), INK)
gd = ImageDraw.Draw(glow)
gd.ellipse([W - 520, -260, W + 120, 260], fill=(60, 30, 16))
img = Image.blend(img, glow, 0.5)
d = ImageDraw.Draw(img)

# right: real dog output
try:
    dog = Image.open(os.path.join(PUB, "sit.png")).convert("RGB")
    dw, dh = 560, 470
    dog = dog.resize((dw, int(dog.height * dw / dog.width)))
    if dog.height > dh:
        top = (dog.height - dh) // 2
        dog = dog.crop((0, top, dw, top + dh))
    card = Image.new("RGB", (dog.width + 8, dog.height + 8), (40, 30, 22))
    card.paste(dog, (4, 4))
    img.paste(card, (W - dog.width - 56, (H - dog.height) // 2))
except Exception:
    pass

# left: copy
x = 64
d.rectangle([x, 92, x + 54, 98], fill=EMBER)
d.text((x, 116), "GoodBoy", font=font(46), fill=BONE)
d.text((x, 196), "Train your dog at home.", font=font(58), fill=BONE)
d.text((x, 262), "The AI checks its work.", font=font(58), fill=EMBER)
d.text((x, 360), "Point your camera. It calls SIT —", font=font(30, False), fill=MUT)
d.text((x, 400), "and verifies your dog actually did it.", font=font(30, False), fill=MUT)
d.rounded_rectangle([x, 470, x + 360, 532], radius=14, fill=EMBER)
d.text((x + 26, 487), "Try it free in your browser", font=font(28), fill=INK)

img.save(os.path.join(PUB, "og.png"))
print("wrote", os.path.join(PUB, "og.png"), img.size)
