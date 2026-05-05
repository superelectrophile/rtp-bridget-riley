# Recreating the Past: Bridget Riley

Github Pages: [https://superelectrophile.github.io/rtp-bridget-riley/](https://superelectrophile.github.io/rtp-bridget-riley/)

Inspired by Bridget Riley’s op art work _Pause_ (1964). Reference: [Bridget Riley, _Pause_, 1964](https://gazelliarthouse.com/artists/bridget-riley/works/bridget-riley-pause-1964/) (Gazelli Art House).

This repository (**rtp-bridget-riley**) is an interactive web piece: a checkerboard of ellipses whose column spacing is distorted by two “bars,” combined with live camera input. In **Face** mode, MediaPipe infers your face in the browser and uses those landmarks to place the bars and to modulate a soft highlight over the grid. **Debug** mode keeps the same distortion math but drives the bars manually.

Stack: React, Vite, D3 (SVG), and `@mediapipe/tasks-vision` for the Face Landmarker task.

## Face landmark detection

Face tracking is implemented in [`FaceMeshOverlay.tsx`](src/FaceMeshOverlay.tsx) on top of **MediaPipe Face Landmarker** (`FaceLandmarker` from `@mediapipe/tasks-vision`).

### Model and capture

- The bundled **face_landmarker** float16 model is loaded from Google Cloud Storage (see `MODEL_URL` in the overlay).
- The WASM runtime is loaded from jsDelivr (`FilesetResolver.forVisionTasks`).
- The landmarker is created in **`VIDEO`** running mode for `detectForVideo` on a sequence of frames.
- **`numFaces: 1`** — only the first detected face is used.
- **Delegate:** GPU is requested first; if that fails, creation is retried with **CPU**.
- A **front-facing** webcam stream (`getUserMedia`, `facingMode: "user"`) is drawn to a canvas matched to the checkerboard SVG size; each animation frame runs detection on the current canvas image.

Landmarks are returned in **normalized image coordinates** (x, y in [0, 1] relative to the input). For display and for sharing data with the grid, coordinates are converted to **SVG pixel space** and the x-axis is **mirrored** so the preview matches a typical user-facing mirror.

### Using landmarks in the app

1. **Bar positions (Face mode)**  
   For the primary face, the code computes the **horizontal extent** of all landmarks: minimum and maximum x after mirroring and scaling to the overlay width. Those values are written to `faceBoundsRef` as fractions of width in [0, 1].  
   [`CheckerboardGrid.tsx`](src/CheckerboardGrid.tsx) reads these bounds each frame and **eases** the effective bar fractions toward the left/right edges of the face, enforces a **minimum separation** between the two bars, and when no face is present animates the bars **off-screen** (same idea as turning distortion off). The bars remain non-interactive in Face mode.

2. **Face “glow” sampling**  
   Separate from the bar logic, a set of **weighted 2D points** is built for shading: vertices from the **face oval** outline, **left/right eye** connection sets, **lips**, plus a single **nose proxy** — the midpoint between the centroid of eye points and the centroid of lip points (each centroid is a plain average in pixel space). Weights are defined in [`faceGlowHull.ts`](src/faceGlowHull.ts). Samples are **deduped** when multiple landmarks map to the same rounded pixel.  
   For each ellipse in the grid, the renderer sums **weighted Gaussians** from those samples (`weight × amplitude × exp(−(distance/radius)²)`), maps that sum through a smoothstep to a **whitening** factor, and combines it with an existing edge-based desaturation so the face region reads as a brighter, softer area over the checkerboard (see `glowSumAt` / `ellipseFillAt` in [`CheckerboardGrid.tsx`](src/CheckerboardGrid.tsx)).

3. **Optional mesh overlay**  
   If “Face mesh” is enabled, the same landmark set drives an SVG path built from **MediaPipe’s tesselation** edges (`FACE_LANDMARKS_TESSELATION`), so you can see the dense triangulation for debugging.

All of the above runs **locally in the tab** after you grant camera permission; this project does not send video or landmarks to a backend.

## Layout algorithm

The core of the visualization is `computeLayout` in [`CheckerboardGrid.tsx`](src/CheckerboardGrid.tsx). Its job is to assign a display-space x position to each column given the two bar positions.

### The ODE perspective

Each column's width is `cellSize · f(x)`, where `f(x)` is the distortion factor at display position `x`:

```
f(x) = 1 − max(A·exp(−((x−p₁)/b)²), A·exp(−((x−p₂)/b)²))
```

`A` is amplitude, `b` is spread, and `p₁`, `p₂` are the bar positions. `f` is close to 1 far from any bar and dips toward `1−A` at a bar.

The column positions satisfy the recurrence `x[n+1] = x[n] + cellSize · f(x[n])`, which is the **forward Euler method** for the ODE:

```
dx/dn = cellSize · f(x),    x(cSplit) = anchorX
```

where `n` is column index and `anchorX = (p₁+p₂)/2` is the fixed anchor. In the continuous limit this integrates to:

```
∫_{anchorX}^{x(n)} dt/f(t)  =  cellSize · (n − cSplit)
```

`f` is the local scale factor of the mapping from column-index space to display space. Columns pile up wherever `f` is small — i.e. at the bar positions — which is why the maximum distortion aligns with the bars in display space, not in some abstract undistorted space.

### Evaluating in display space

Evaluating `f` at the running display position `x[n]` (rather than at a pre-computed undistorted position `n·cellSize`) is what makes this self-referential and correct: the compression is measured where the column actually ends up, so the bars are truly at the visual peaks of distortion.

### Continuity: why cSplit is fixed

The algorithm integrates rightward from `cSplit` and leftward from `cSplit−1`, both starting at `anchorX`. If `cSplit` tracked `floor(anchorX/cellSize)`, a column would switch sides whenever the anchor crossed a column boundary, causing a discontinuous jump (~cellSize in magnitude). Fixing `cSplit = floor(cols/2)` means no column ever switches sides: the only thing that changes as the anchor moves is the initial condition `x(cSplit) = anchorX`, which varies continuously.

## Constants

| Name                   | Role                                                    |
| ---------------------- | ------------------------------------------------------- |
| `DISTORTION_AMPLITUDE` | `A` — maximum fraction of column width removed at a bar |
| `DISTORTION_SPREAD`    | `b` — Gaussian half-width of the distortion in pixels   |
| `BAR_WIDTH`            | Visual width of the draggable bar rect in pixels        |

Face glow tuning (see `CheckerboardGrid.tsx` / `faceGlowHull.ts`): `FACE_GLOW_A`, `FACE_GLOW_B`, `FACE_GLOW_SUM_NORMALIZER`, and per-feature weights for oval, eyes, lips, and the nose proxy.
