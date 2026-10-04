"""Raw gallery shots (1280x769) from the e2e captures: shot1 sidebar, shot2 settings, shot3 before/after + popup."""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
RAW = os.path.join(ROOT, "raw")
FONTS = os.path.join(ROOT, "extension", "fonts")
W, H = 1280, 769
INK, MUTED, BG = (243, 239, 231), (167, 163, 155), (21, 23, 27)


def load(name):
    return Image.open(os.path.join(RAW, name)).convert("RGB")


def card(canvas, img, xy, r=10):
    x, y = xy
    sh = Image.new("RGBA", (img.width + 80, img.height + 80), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([40, 48, 40 + img.width, 48 + img.height], r, fill=(0, 0, 0, 150))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)), (x - 40, y - 40))
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.width - 1, img.height - 1], r, fill=255)
    canvas.paste(img, (x, y), m)


def main():
    load("sidebar_dark.png").resize((W, H), Image.LANCZOS).save(os.path.join(ROOT, "shot1.png"))
    load("options_dark.png").resize((W, H), Image.LANCZOS).save(os.path.join(ROOT, "shot2.png"))
    bg = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(bg)
    big = ImageFont.truetype(os.path.join(FONTS, "bricolage-700.woff2"), 26) if False else None
    try:
        big = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 24)
        small = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
    except OSError:
        big = small = ImageFont.load_default()
    box = (640, 150, 1910, 1538)  # article column at 2x, same region in both captures
    cw = 400
    ch = int(cw * (box[3] - box[1]) / (box[2] - box[0]))
    b = load("before.png").crop(box).resize((cw, ch), Image.LANCZOS)
    a = load("after.png").crop(box).resize((cw, ch), Image.LANCZOS)
    pop = load("popup_dark.png")
    pop = pop.resize((360, int(pop.height * 360 / pop.width)), Image.LANCZOS)
    top = 104
    for x, title, sub in ((40, "Before", "A public domain book page"), (470, "After", "Highlights return on every visit"), (900, "Toolbar popup", "Notes for the current tab")):
        d.text((x, 44), title, font=big, fill=INK)
        d.text((x, 76), sub, font=small, fill=MUTED)
    card(bg, b, (40, top))
    card(bg, a, (470, top))
    card(bg, pop, (900, top))
    bg.convert("RGB").save(os.path.join(ROOT, "shot3.png"))
    for n in ("shot1.png", "shot2.png", "shot3.png"):
        print(n, Image.open(os.path.join(ROOT, n)).size)


if __name__ == "__main__":
    main()
