"""Draw the Flow app icon: a rounded square carrying three stacked flow waves.
Pure Pillow, deterministic, no external assets — CI and the landing page always match."""
from PIL import Image, ImageDraw
import math

S = 1024
SS = 4  # supersample factor for smooth curves
W = S * SS

img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded square with a vertical accent gradient
radius = int(W * 0.22)
bg = Image.new('RGBA', (W, W), (0, 0, 0, 0))
bd = ImageDraw.Draw(bg)
top, bottom = (134, 152, 255), (92, 104, 232)
for y in range(W):
    t = y / (W - 1)
    bd.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
mask = Image.new('L', (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=radius, fill=255)
img.paste(bg, (0, 0), mask)

def wave_band(cy_frac, amp_frac, thick_frac, phase, alpha, color=(255, 255, 255)):
    """A sine band drawn as a filled polygon: crisp at any size, no dashes."""
    upper, lower = [], []
    for x in range(0, W + 1, 2):
        y = cy_frac * W + math.sin((x / W) * math.pi * 2.35 + phase) * amp_frac * W
        upper.append((x, y - thick_frac * W / 2))
        lower.append((x, y + thick_frac * W / 2))
    d.polygon(upper + lower[::-1], fill=color + (alpha,))
    # round caps so the band never ends in a raw edge
    r = thick_frac * W / 2
    for (x, y) in (upper[0], upper[-1]):
        d.ellipse([x - r, y, x + r, y + 2 * r], fill=color + (alpha,))

wave_band(0.300, 0.050, 0.048, 0.0, 170)
wave_band(0.500, 0.068, 0.056, 1.05, 245)
wave_band(0.700, 0.050, 0.048, 2.10, 145)

img = img.resize((S, S), Image.LANCZOS)
img.save('build/icon.png')
img.resize((512, 512), Image.LANCZOS).save('build/icon-512.png')
img.resize((256, 256), Image.LANCZOS).save('build/icon-256.png')
img.save('build/icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok', img.size)
