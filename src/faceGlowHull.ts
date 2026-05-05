import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

export type GlowPt = { x: number; y: number };

/** Glow Gaussian center with scalar weight applied to f_P before summing. */
export type GlowSample = { x: number; y: number; weight: number };

/** Weight for face-oval glow centers (hull outline). */
export const GLOW_WEIGHT_FACE_OVAL = 1;

/** Per-landmark weight for eye glow centers. */
export const GLOW_WEIGHT_EYES = 0.3;

/** Per-landmark weight for lip glow centers. */
export const GLOW_WEIGHT_LIPS = 0.15;

/** Nose proxy (midpoint of eye vs mouth group centroids); blends the two group weights. */
export const GLOW_WEIGHT_NOSE_PROXY = (GLOW_WEIGHT_EYES + GLOW_WEIGHT_LIPS) / 2;

export function dedupeGlowSamples(samples: GlowSample[]): GlowSample[] {
  const map = new Map<string, GlowSample>();
  for (const p of samples) {
    const k = `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
    const existing = map.get(k);
    if (existing) {
      existing.weight += p.weight;
    } else {
      map.set(k, { x: p.x, y: p.y, weight: p.weight });
    }
  }
  return [...map.values()];
}

function cross(o: GlowPt, a: GlowPt, b: GlowPt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

export function dedupePoints(points: GlowPt[]): GlowPt[] {
  const seen = new Set<string>();
  const out: GlowPt[] = [];
  for (const p of points) {
    const k = `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/** Maps every landmark to display pixels (optional convex-hull glow path). */
export function landmarksToGlowPoints(
  landmarks: NormalizedLandmark[],
  cw: number,
  ch: number,
  mirror: boolean,
): GlowPt[] {
  const out: GlowPt[] = [];
  for (const lm of landmarks) {
    out.push({
      x: (mirror ? 1 - lm.x : lm.x) * cw,
      y: lm.y * ch,
    });
  }
  return out;
}

/** 2D convex hull (Andrew’s monotone chain); drops collinear points on edges. */
export function convexHull2D(points: GlowPt[]): GlowPt[] {
  const n = points.length;
  if (n <= 2) return points.slice();

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: GlowPt[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: GlowPt[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Attach a uniform weight to each point (e.g. convex-hull glow path). */
export function glowSamplesFromPts(
  points: GlowPt[],
  weight: number,
): GlowSample[] {
  return points.map((p) => ({ x: p.x, y: p.y, weight }));
}
