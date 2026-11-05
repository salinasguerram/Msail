"""
Genera el ícono provisorio de MSAIL (flecha de navegación azul sobre fondo azul noche)
para la pestaña del navegador, en el panel y en la app web. Se reemplaza cuando llegue el logo oficial.

Uso (desde backend/): python scripts/make_favicon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TARGETS = [ROOT / "static" / "msail" / "favicon.png", ROOT.parent / "app" / "assets" / "favicon.png"]

BACKGROUND = (11, 23, 48)  # superficie de la app (#0B1730)
BORDER = (28, 44, 77)  # bordes (#1C2C4D)
ARROW = (47, 140, 255)  # azul MSAIL (#2F8CFF)
SIZE = 192
SCALE = 4  # se dibuja más grande y se reduce, para bordes suaves


def draw(size):
    big = size * SCALE
    image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    canvas = ImageDraw.Draw(image)
    radius = int(big * 0.22)
    canvas.rounded_rectangle([0, 0, big - 1, big - 1], radius=radius, fill=BACKGROUND, outline=BORDER, width=int(big * 0.03))
    # Flecha de navegación apuntando al noreste (como el ícono del encabezado).
    points = [(0.78, 0.22), (0.20, 0.47), (0.49, 0.51), (0.53, 0.80)]
    canvas.polygon([(x * big, y * big) for x, y in points], fill=ARROW)
    return image.resize((size, size), Image.Resampling.LANCZOS)


if __name__ == "__main__":
    icon = draw(SIZE)
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        icon.save(target)
        print(f"{target.relative_to(ROOT.parent)}  ({SIZE}x{SIZE})")
