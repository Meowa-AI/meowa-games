---
name: reference-to-3d-building
description: Generate an orthographic three-view building turnaround from a local visual reference, then build and validate a textured 3D game building from those exact front, side, and back views. Use for reference-based houses, shops, civic buildings, or other small environment architecture; do not use for generic 3D modeling without a visual reference.
---

# Reference to 3D Building

Create the turnaround before writing building geometry. If Meowa is available, also load the `game-assets` skill and follow its current capability, authentication, output, and validation rules.

## Fix the contract first

Record the map tile size, building footprint, required views, art representation, transparency, runtime texture format, and coordinate convention. Keep downloaded or copyrighted references in an ignored local input directory; only generated and approved runtime assets belong in tracked asset directories.

Use one reference crop per building type. Reuse one approved turnaround for repeated instances of the same type.

## Generate and approve the turnaround

Generate one transparent sheet directly from the reference with exactly three orthographic views at one scale:

1. front;
2. right side;
3. true back.

The prompt must preserve the reference footprint, silhouette, roof family, entrance language, and main identifying features while allowing only the requested redesign. Require no perspective, ground, scenery, labels, characters, vehicles, or unrelated objects.

Do not begin modeling until visual inspection confirms:

- all three views exist and are separated;
- apparent wall and roof heights use one scale;
- the side view describes real depth and is not a squeezed front;
- the back is logically a back wall, without front-only signs or entrances;
- transparency is usable and no unrelated component remains.

Regenerate a failed view. Never mirror or reuse the front texture as a side or back substitute. Use `scripts/inspect_turnaround.py` to report large transparent components, but treat its result as structural evidence rather than visual approval.

## Extract and model

Copy only the approved generated sheet into runtime source assets. Crop wall and roof regions mechanically without repainting them. Keep a clear crop manifest so regeneration remains deterministic.

Derive proportions from the views: front width controls `x`, side width controls depth `z`, and aligned vertical landmarks control wall, eave, and ridge heights. Match the roof family visible in the turnaround, such as gable or four-face hip. Map front material to `+z`, back to `-z`, and the right-side material to `+x` and, when no left view exists, `-x`.

Read [references/modeling-contract.md](references/modeling-contract.md) when implementing geometry, UVs, collision, or runtime validation.

## Validate the finished building

Inspect the game from front, oblique side, and back camera angles. At each angle confirm the corresponding view texture, roof silhouette, scale, grounding, alpha edges, shadows, and collision footprint. Reject a model that looks correct only from the default camera.

Run the project build and focused map-connectivity checks. Keep source turnarounds, extracted runtime textures, placement data, collision data, and model code consistent.
