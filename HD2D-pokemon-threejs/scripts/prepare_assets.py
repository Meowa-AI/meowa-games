#!/usr/bin/env python3
"""Publish only the final assets listed in assets/runtime-manifest.json.

Generation and reference extraction are separate from publishing: rebuilding the
project must never restore an old reference or an unused image.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from shutil import copyfile

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets' / 'runtime-source'
OUTPUT = ROOT / 'public' / 'assets'
MANIFEST = ROOT / 'assets' / 'runtime-manifest.json'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check closure and bytes without writing files')
    args = parser.parse_args()
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if data.get('version') != 1:
        raise ValueError('Unsupported runtime asset manifest version')
    paths = [Path(entry['path']) for entry in data['assets']]
    if len(set(paths)) != len(paths):
        raise ValueError('Duplicate runtime asset paths')
    for relative in paths:
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError(f'Unsafe runtime path: {relative}')
        if not (SOURCE / relative).is_file():
            raise FileNotFoundError(f'Missing final source asset: {relative}')
    keep = set(paths)
    source_extras = [p.relative_to(SOURCE) for p in SOURCE.rglob('*') if p.is_file() and p.relative_to(SOURCE) not in keep]
    if source_extras:
        raise ValueError(f'Unlisted source assets: {source_extras}')
    media_suffixes = {'.png', '.svg', '.wav', '.webp', '.gif', '.mp3', '.ogg', '.json'}
    extras = [p for p in OUTPUT.rglob('*') if p.is_file() and p.suffix.lower() in media_suffixes and p.relative_to(OUTPUT) not in keep]
    different = [relative for relative in paths if not (OUTPUT / relative).is_file()
                 or (SOURCE / relative).read_bytes() != (OUTPUT / relative).read_bytes()]
    if args.check:
        if extras or different:
            raise ValueError(f'Runtime assets differ: missing/changed={different}, unused={extras}')
        print(f'OK: {len(paths)} final assets; no missing, different, or unused media')
        return
    for relative in different:
        target = OUTPUT / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        copyfile(SOURCE / relative, target)
    for extra in extras:
        extra.unlink()
    for directory in sorted(OUTPUT.rglob('*'), key=lambda p: len(p.parts), reverse=True):
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    print(f'Published {len(paths)} final assets; updated {len(different)}, removed {len(extras)} unused media')


if __name__ == '__main__':
    main()
