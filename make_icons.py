"""Draws public/icons/icon{16,32,48,128}.png (standard library only).
Gradient rounded square with a stack of three overlapping profile circles."""
import math, os, struct, zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "icons")

def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))

BG_A, BG_B = (124, 58, 237), (236, 72, 153)        # violet -> pink
DOTS = [  # (cx, cy, r, fill) in unit coords, back to front
    (0.30, 0.56, 0.17, (253, 224, 71)),
    (0.70, 0.56, 0.17, (94, 234, 212)),
    (0.50, 0.46, 0.21, (255, 255, 255)),
]
RING = 0.045  # gap ring between circles, in bg colour

def rounded_sq(x, y, r=0.22):
    dx, dy = max(abs(x - .5) - (.5 - r), 0), max(abs(y - .5) - (.5 - r), 0)
    return math.hypot(dx, dy) <= r

def shade(x, y):
    if not rounded_sq(x, y): return None
    bg = lerp(BG_A, BG_B, (x + y) / 2)
    col = bg
    for cx, cy, r, fill in DOTS:
        d = math.hypot(x - cx, y - cy)
        if d <= r + RING: col = bg
        if d <= r:
            col = fill
            # tiny head/shoulders silhouette on the front circle
            if fill == (255, 255, 255):
                if math.hypot(x - cx, y - (cy - .05)) <= r * .36 or (
                    math.hypot(x - cx, y - (cy + r * .95)) <= r * .72):
                    col = lerp(BG_A, BG_B, .35)
    return col

def render(size, ss=6):
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc, n = [0, 0, 0], 0
            for sy in range(ss):
                for sx in range(ss):
                    c = shade((px + (sx + .5) / ss) / size, (py + (sy + .5) / ss) / size)
                    if c:
                        n += 1
                        for i in range(3): acc[i] += c[i]
            if n: row += bytes(int(round(acc[i] / n)) for i in range(3)) + bytes([round(255 * n / ss / ss)])
            else: row += b"\0\0\0\0"
        rows.append(bytes(row))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))

os.makedirs(OUT, exist_ok=True)
for s in (16, 32, 48, 128):
    open(os.path.join(OUT, f"icon{s}.png"), "wb").write(render(s))
print("ok")
