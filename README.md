# rtp-bridget-riley

A generative grid visualization inspired by Bridget Riley's op-art. A checkerboard of ellipses is distorted by two draggable bars, compressing columns toward each bar position.

## Layout algorithm

The core of the visualization is `computeLayout` in [CheckerboardGrid.tsx](src/CheckerboardGrid.tsx). Its job is to assign a display-space x position to each column given the two bar positions.

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

| Name | Role |
|---|---|
| `DISTORTION_AMPLITUDE` | `A` — maximum fraction of column width removed at a bar |
| `DISTORTION_SPREAD` | `b` — Gaussian half-width of the distortion in pixels |
| `BAR_WIDTH` | Visual width of the draggable bar rect in pixels |
