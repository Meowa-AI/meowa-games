# Building modeling contract

## Coordinate and face mapping

- Put the building origin at the center of its front ground edge.
- Use `+x` for right, `+z` for front, and extend building depth toward `-z`.
- A box material order must be checked against the engine geometry implementation. In Three.js `BoxGeometry`, the common order is `+x, -x, +y, -y, +z, -z`.
- Assign the generated front wall only to `+z`, the generated back wall only to `-z`, and the generated right wall to `+x`. Reuse it on `-x` only when a left view was not requested.

## Geometry from views

- Convert the front-view pixel width to the map footprint width.
- Compute depth from the side-view wall span instead of guessing from the front.
- Align wall base, eave, roof shoulder, ridge, doors, and windows across views before choosing world heights.
- Use a gable prism when the side view has a triangular gable.
- Use a four-face hip or stepped hip when front, side, and back show sloped faces around a smaller top.
- A top surface absent from the turnaround may use a restrained solid material sampled from the generated roof palette. Do not place a transparent front cutout on a horizontal top face.

## Texture extraction

Store crop rectangles as `(left, top, right, bottom)` in a deterministic preprocessing script. Extract separate files for wall front, wall side, wall back, roof front, roof side or gable, and roof back. Preserve alpha and nearest-neighbor sampling for pixel art.

Do not silently stretch a complete building view across only a wall or roof face. Split at the visible eave line first. Avoid including the emblem or roof band in both wall and roof crops unless the turnaround intentionally overlaps them at the seam.

## Placement and collision

- Define the occupied rectangle in the same tile layout data that creates the prop.
- Use the rectangle width for horizontal placement and its bottom row as the front baseline.
- Block the whole declared footprint unless the design explicitly contains a walk-through area.
- Repeated instances may clone one template but must not share mutable transforms.

## Evidence checklist

Capture front, roughly 45-to-90-degree side, and 180-degree back screenshots. Confirm that front-only signage disappears at the back, side windows appear only on side faces, roofs do not contain transparent holes, and the building touches the ground without floating or sinking.
