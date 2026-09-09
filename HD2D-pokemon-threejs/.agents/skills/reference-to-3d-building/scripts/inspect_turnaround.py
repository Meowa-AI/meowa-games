#!/usr/bin/env python3
"""Report large alpha-connected components in a generated turnaround sheet."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def components(image: Image.Image, alpha_threshold: int, min_pixels: int) -> list[dict]:
    alpha = image.getchannel('A')
    pixels = alpha.load()
    width, height = image.size
    seen: set[tuple[int, int]] = set()
    found: list[dict] = []
    for y in range(height):
        for x in range(width):
            if pixels[x, y] < alpha_threshold or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            min_x = max_x = x
            min_y = max_y = y
            count = 0
            while stack:
                px, py = stack.pop()
                count += 1
                min_x, max_x = min(min_x, px), max(max_x, px)
                min_y, max_y = min(min_y, py), max(max_y, py)
                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if (
                        0 <= nx < width and 0 <= ny < height
                        and pixels[nx, ny] >= alpha_threshold
                        and (nx, ny) not in seen
                    ):
                        seen.add((nx, ny))
                        stack.append((nx, ny))
            if count >= min_pixels:
                found.append({
                    'pixels': count,
                    'bbox': [min_x, min_y, max_x + 1, max_y + 1],
                    'width': max_x - min_x + 1,
                    'height': max_y - min_y + 1,
                })
    return sorted(found, key=lambda item: (item['bbox'][0], item['bbox'][1]))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('image', type=Path)
    parser.add_argument('--expected', type=int, default=3)
    parser.add_argument('--alpha-threshold', type=int, default=32)
    parser.add_argument('--min-pixels', type=int, default=100)
    args = parser.parse_args()

    image = Image.open(args.image).convert('RGBA')
    found = components(image, args.alpha_threshold, args.min_pixels)
    print(json.dumps({
        'image': str(args.image),
        'canvas': list(image.size),
        'alpha_extrema': list(image.getchannel('A').getextrema()),
        'large_component_count': len(found),
        'components': found,
    }, ensure_ascii=False, indent=2))
    return 0 if len(found) == args.expected else 1


if __name__ == '__main__':
    raise SystemExit(main())
