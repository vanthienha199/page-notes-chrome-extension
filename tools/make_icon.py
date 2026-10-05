"""Draws the toolbar icon: a notebook page with a margin rule and one pink-highlighted line."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
S = 512
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((40, 24, 472, 488), radius=56, fill="#FFFDF7", outline="#1C1B18", width=22)
d.line((150, 60, 150, 452), fill="#E2D9C8", width=12)
d.rounded_rectangle((176, 214, 430, 290), radius=10, fill="#F7A8C8")
for y, x2 in ((150, 400), (252, 404), (354, 340)):
    d.rounded_rectangle((196, y - 15, x2, y + 15), radius=15, fill="#1C1B18")
for size in (16, 48, 128):
    img.resize((size, size), Image.LANCZOS).save(OUT / f"{size}.png")
print("icons written")
