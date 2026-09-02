#!/usr/bin/env python3
"""Gera o PNG do círculo de atualização (círculo geométrico, sem CSS)."""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "src" / "assets" / "update-download.png"
SIZE = 44
AA = 4
GREEN = (94, 207, 142, 255)
DARK = (18, 48, 31, 255)


def write_png(path: Path, width: int, height: int, pixels: list[tuple[int, int, int, int]]) -> None:
    raw = bytearray()
    index = 0
    for _y in range(height):
        raw.append(0)
        for _x in range(width):
            raw.extend(pixels[index])
            index += 1

    compressed = zlib.compress(bytes(raw), 9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b""))


def in_circle(x: float, y: float, cx: float, cy: float, radius: float) -> bool:
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius


def dist_to_segment(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    dx = x2 - x1
    dy = y2 - y1
    length = dx * dx + dy * dy
    if length == 0:
        return math.hypot(px - x1, py - y1)
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / length))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def paint_big() -> list[tuple[int, int, int, int]]:
    big = SIZE * AA
    cx = cy = (big - 1) / 2
    radius = big / 2 - AA * 0.4
    stroke = 1.7 * AA
    s = big / 22.0

    shaft = (11 * s, 5.1 * s, 11 * s, 13.2 * s)
    left = (7.5 * s, 10.3 * s, 11 * s, 14.0 * s)
    right = (14.5 * s, 10.3 * s, 11 * s, 14.0 * s)
    tray = (6.5 * s, 16.6 * s, 15.5 * s, 16.6 * s)

    pixels: list[tuple[int, int, int, int]] = []
    for y in range(big):
        for x in range(big):
            px = x + 0.5
            py = y + 0.5
            if not in_circle(px, py, cx, cy, radius):
                pixels.append((0, 0, 0, 0))
                continue
            on_arrow = (
                dist_to_segment(px, py, *shaft) <= stroke
                or dist_to_segment(px, py, *left) <= stroke
                or dist_to_segment(px, py, *right) <= stroke
                or dist_to_segment(px, py, *tray) <= stroke
            )
            pixels.append(DARK if on_arrow else GREEN)
    return pixels


def downsample(big_pixels: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    big = SIZE * AA
    out: list[tuple[int, int, int, int]] = []
    area = AA * AA
    for y in range(SIZE):
        for x in range(SIZE):
            acc = [0, 0, 0, 0]
            for oy in range(AA):
                for ox in range(AA):
                    pixel = big_pixels[(y * AA + oy) * big + (x * AA + ox)]
                    for i in range(4):
                        acc[i] += pixel[i]
            out.append(tuple(v // area for v in acc))  # type: ignore[arg-type]
    return out


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    write_png(OUT, SIZE, SIZE, downsample(paint_big()))
    print("ícone:", OUT)


if __name__ == "__main__":
    main()
