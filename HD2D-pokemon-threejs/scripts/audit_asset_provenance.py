#!/usr/bin/env python3
"""Check the recorded origin and exact bytes of every published asset."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding='utf-8'))


def main():
    manifest = read('assets/runtime-manifest.json')
    provenance = read('assets/provenance/runtime-assets.json')
    remaining = read('assets/provenance/remaining-non-meowa.json')
    audio = read('assets/provenance/retained-audio.json')
    paths = {entry['path'] for entry in manifest['assets']}
    entries = {entry['path']: entry for entry in provenance['assets']}
    errors = []
    if paths != set(entries) or len(entries) != len(provenance['assets']):
        errors.append('Provenance entries do not match the publishing whitelist')
    counts = Counter(entry['origin'] for entry in entries.values())
    if dict(counts) != provenance['counts']:
        errors.append('Recorded origin counts are stale')
    for path, entry in entries.items():
        for directory in ('public/assets', 'assets/runtime-source'):
            file = ROOT / directory / path
            if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != entry['sha256']:
                errors.append(f'Content hash mismatch: {directory}/{path}')
        if path.endswith('.png'):
            if entry['origin'] not in ('existing-meowa-asset', 'meowa-reference-edit'):
                errors.append(f'Image still requires Meowa replacement: {path}')
            if entry['origin'] == 'meowa-reference-edit':
                generation = entry.get('generation', {})
                jobs = generation.get('jobs', [generation])
                if not jobs or any(not job.get('job_id', '').startswith('job_') for job in jobs):
                    errors.append(f'Missing Meowa task record: {path}')
                if generation.get('output_sha256') != entry['sha256']:
                    errors.append(f'Generation hash mismatch: {path}')
        elif path.endswith('.wav') and entry['origin'] != 'original-audio-retained':
            errors.append(f'Unexpected audio replacement: {path}')
        elif path.endswith('.json') and entry['origin'] != 'runtime-metadata':
            errors.append(f'Unexpected metadata origin: {path}')
    retained = {entry['path']: entry for entry in audio['assets']}
    if set(retained) != {path for path in paths if path.endswith('.wav')}:
        errors.append('Retained audio list does not match runtime audio')
    for path, entry in retained.items():
        if entries.get(path, {}).get('sha256') != entry['sha256']:
            errors.append(f'Original audio changed: {path}')
    if remaining['count'] or remaining['assets']:
        errors.append(f"Replacement backlog is not empty: {remaining['count']}")
    print(json.dumps({'assets': len(paths), 'origins': counts, 'errors': errors}, indent=2))
    return bool(errors)


if __name__ == '__main__':
    raise SystemExit(main())
