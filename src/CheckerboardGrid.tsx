import { useEffect, useRef } from "react";
import * as d3 from "d3";

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h},${s}%,${l}%)`;
}

function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Ellipse base color in viewport center; toward left/right edges, → white (s→0, l→100). */
const ELLIPSE_H = 200;
const ELLIPSE_S = 80;
const ELLIPSE_L = 0;
/**
 * Normalized width (in edge-distance `raw` ∈ [0,1]) of black→white blend when
 * EDGE_GRADIENT_SHARPNESS === 1. Not a separate UI knob; tune sharpness instead.
 */
const EDGE_GRADIENT_TRANSITION_BASE = 0.36;
/**
 * Higher = narrower fringe at the viewport edges; ellipses stay saturated (black)
 * farther into the edge zone before fading to white.
 */
const EDGE_GRADIENT_SHARPNESS = 1.0;

function ellipseFillAt(cx: number, viewportWidth: number): string {
  if (viewportWidth <= 0) return hsl(ELLIPSE_H, 0, 100);
  const half = viewportWidth * 0.5;
  const raw = Math.max(0, Math.min(1, Math.min(cx, viewportWidth - cx) / half));
  const band = EDGE_GRADIENT_TRANSITION_BASE / EDGE_GRADIENT_SHARPNESS;
  const t = smoothstep01(Math.min(1, raw / band));
  const s = ELLIPSE_S * t;
  const l = ELLIPSE_L + (100 - ELLIPSE_L) * (1 - t);
  return hsl(ELLIPSE_H, s, l);
}

const BAR_WIDTH = 3;
const INDICATOR_HEIGHT = 36;
const DISTORTION_AMPLITUDE = 0.85; // a: max fraction of rx removed at bar center
const DISTORTION_SPREAD = 80; // b: gaussian falloff width in pixels
const OFF_FRAC = 4; // bars animate to ±OFF_FRAC × svgWidth when toggled off
/** Extra columns in the layout (split left / right) so compressed distortion still spans the viewport. */
const PADDING_COLS = 60;

function distortionFactor(ux: number, bar1X: number, bar2X: number): number {
  const g1 =
    DISTORTION_AMPLITUDE * Math.exp(-(((ux - bar1X) / DISTORTION_SPREAD) ** 2));
  const g2 =
    DISTORTION_AMPLITUDE * Math.exp(-(((ux - bar2X) / DISTORTION_SPREAD) ** 2));
  return 1 - Math.max(g1, g2);
}

// Returns distorted center x and width for each column, anchored at the mean of both bars.
// cSplit is fixed at cols/2 so no column ever switches groups as the anchor moves,
// eliminating the snap that would occur if cSplit tracked floor(anchorX/cellSize).
// Each column evaluates distortion at its leading edge in true display space.
function computeLayout(
  cols: number,
  cellSize: number,
  bar1X: number,
  bar2X: number,
): { centers: number[]; widths: number[] } {
  const anchorX = (bar1X + bar2X) / 2;
  const cSplit = Math.floor(cols / 2);

  const centers = new Array<number>(cols);
  const widths = new Array<number>(cols);

  let pos = anchorX;
  for (let c = cSplit; c < cols; c++) {
    const w = cellSize * distortionFactor(pos, bar1X, bar2X);
    widths[c] = w;
    centers[c] = pos + w / 2;
    pos += w;
  }

  pos = anchorX;
  for (let c = cSplit - 1; c >= 0; c--) {
    const w = cellSize * distortionFactor(pos, bar1X, bar2X);
    widths[c] = w;
    centers[c] = pos - w / 2;
    pos -= w;
  }

  return { centers, widths };
}

interface Props {
  cellSize?: number;
  distortionOn?: boolean;
}

export default function CheckerboardGrid({
  cellSize = 24,
  distortionOn = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const indicatorRef = useRef<SVGSVGElement>(null);
  // Stored positions (where the bars live when dragged / toggled on)
  const bar1FractionRef = useRef(0.33);
  const bar2FractionRef = useRef(0.67);
  // Effective positions (animated; what's actually rendered)
  const bar1EffFracRef = useRef(0.33);
  const bar2EffFracRef = useRef(0.67);
  const svgWidthRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  // Closed over latest draw() state; called by the animation loop
  const renderRef = useRef<(() => void) | null>(null);
  const distortionOnRef = useRef(distortionOn);
  distortionOnRef.current = distortionOn;

  useEffect(() => {
    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    const indicator = d3.select(indicatorRef.current);

    function updateIndicator(svgWidth: number) {
      const positions = [
        bar1EffFracRef.current * svgWidth,
        bar2EffFracRef.current * svgWidth,
      ];

      indicator.attr("width", svgWidth).attr("height", INDICATOR_HEIGHT);

      indicator
        .selectAll<SVGLineElement, unknown>(".ind-track")
        .data([null])
        .join("line")
        .attr("class", "ind-track")
        .attr("x1", 0)
        .attr("y1", INDICATOR_HEIGHT / 2)
        .attr("x2", svgWidth)
        .attr("y2", INDICATOR_HEIGHT / 2)
        .attr("stroke", hsl(0, 0, 75))
        .attr("stroke-width", 1.5);

      indicator
        .selectAll<SVGCircleElement, number>(".ind-marker")
        .data(positions)
        .join("circle")
        .attr("class", "ind-marker")
        .attr("cx", (d: number) => d)
        .attr("cy", INDICATOR_HEIGHT / 2)
        .attr("r", 6)
        .attr("fill", hsl(0, 0, 0))
        .attr("visibility", (d: number) =>
          d >= 0 && d <= svgWidth ? "visible" : "hidden",
        );
    }

    function draw() {
      if (!container) return;
      const viewportCols = Math.floor(container.clientWidth / cellSize);
      const layoutCols = viewportCols + PADDING_COLS;
      const rows = Math.floor(
        (container.clientHeight - INDICATOR_HEIGHT) / cellSize,
      );
      const svgWidth = viewportCols * cellSize;
      const svgHeight = rows * cellSize;
      const radius = cellSize / 2;

      svgWidthRef.current = svgWidth;
      svg.attr("width", svgWidth).attr("height", svgHeight);

      svg.selectAll("ellipse").remove();
      const cells: [number, number][] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < layoutCols; c++) {
          if ((c + r) % 2 === 0) cells.push([c, r]);
        }
      }

      const bar1X = bar1EffFracRef.current * svgWidth;
      const bar2X = bar2EffFracRef.current * svgWidth;
      const { centers, widths } = computeLayout(
        layoutCols,
        cellSize,
        bar1X,
        bar2X,
      );

      svg
        .selectAll("ellipse")
        .data(cells)
        .join("ellipse")
        .attr("cx", ([c]) => centers[c])
        .attr("cy", ([, r]) => r * cellSize + cellSize / 2)
        .attr("rx", ([c]) => widths[c] / 2)
        .attr("ry", radius)
        .attr("fill", ([c]) => ellipseFillAt(centers[c], svgWidth))
        .attr("stroke", "none");

      function updateEllipses(p1: number, p2: number) {
        const { centers: newCenters, widths: newWidths } = computeLayout(
          layoutCols,
          cellSize,
          p1,
          p2,
        );
        const wv = svgWidthRef.current;
        svg
          .selectAll<SVGEllipseElement, [number, number]>("ellipse")
          .attr("cx", ([c]) => newCenters[c])
          .attr("rx", ([c]) => newWidths[c] / 2)
          .attr("fill", ([c]) => ellipseFillAt(newCenters[c], wv));
      }

      // Bar 1
      const barGroup1 = svg
        .selectAll<SVGGElement, unknown>(".bar-group-1")
        .data([null])
        .join("g")
        .attr("class", "bar-group-1")
        .raise();

      const bar1 = barGroup1
        .selectAll<SVGRectElement, unknown>("rect")
        .data([null])
        .join("rect")
        .attr("x", bar1X - BAR_WIDTH / 2)
        .attr("y", 0)
        .attr("width", BAR_WIDTH)
        .attr("height", svgHeight)
        .attr("fill", hsl(0, 0, 40))
        .style("cursor", "ew-resize");

      bar1.call(
        d3
          .drag<SVGRectElement, unknown>()
          .on(
            "drag",
            (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
              const newX = Math.max(0, Math.min(svgWidth, event.x));
              bar1FractionRef.current = newX / svgWidth;
              bar1EffFracRef.current = newX / svgWidth;
              bar1.attr("x", newX - BAR_WIDTH / 2);
              updateEllipses(newX, bar2EffFracRef.current * svgWidth);
              updateIndicator(svgWidth);
            },
          ),
      );

      // Bar 2
      const barGroup2 = svg
        .selectAll<SVGGElement, unknown>(".bar-group-2")
        .data([null])
        .join("g")
        .attr("class", "bar-group-2")
        .raise();

      const bar2 = barGroup2
        .selectAll<SVGRectElement, unknown>("rect")
        .data([null])
        .join("rect")
        .attr("x", bar2X - BAR_WIDTH / 2)
        .attr("y", 0)
        .attr("width", BAR_WIDTH)
        .attr("height", svgHeight)
        .attr("fill", hsl(0, 0, 40))
        .style("cursor", "ew-resize");

      bar2.call(
        d3
          .drag<SVGRectElement, unknown>()
          .on(
            "drag",
            (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
              const newX = Math.max(0, Math.min(svgWidth, event.x));
              bar2FractionRef.current = newX / svgWidth;
              bar2EffFracRef.current = newX / svgWidth;
              bar2.attr("x", newX - BAR_WIDTH / 2);
              updateEllipses(bar1EffFracRef.current * svgWidth, newX);
              updateIndicator(svgWidth);
            },
          ),
      );

      renderRef.current = () => {
        const w = svgWidthRef.current;
        const p1 = bar1EffFracRef.current * w;
        const p2 = bar2EffFracRef.current * w;
        updateEllipses(p1, p2);
        bar1.attr("x", p1 - BAR_WIDTH / 2);
        bar2.attr("x", p2 - BAR_WIDTH / 2);
        updateIndicator(w);
      };

      const pointerEvents = distortionOnRef.current ? "auto" : "none";
      bar1.style("pointer-events", pointerEvents);
      bar2.style("pointer-events", pointerEvents);

      updateIndicator(svgWidth);
    }

    draw();

    const observer = new ResizeObserver(draw);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [cellSize]);

  useEffect(() => {
    const duration = 600;
    const startTime = performance.now();
    const startFrac1 = bar1EffFracRef.current;
    const startFrac2 = bar2EffFracRef.current;
    const targetFrac1 = distortionOn ? bar1FractionRef.current : -OFF_FRAC;
    const targetFrac2 = distortionOn ? bar2FractionRef.current : 1 + OFF_FRAC;

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const svgEl = svgRef.current;
    if (svgEl) {
      const pe = distortionOn ? "auto" : "none";
      d3.select(svgEl)
        .selectAll<
          SVGRectElement,
          unknown
        >(".bar-group-1 rect, .bar-group-2 rect")
        .style("pointer-events", pe);
    }

    // Skip animation when start equals target (e.g. initial mount)
    if (startFrac1 === targetFrac1 && startFrac2 === targetFrac2) return;

    function smoothstep(t: number): number {
      return t * t * (3 - 2 * t);
    }

    function tick() {
      const elapsed = performance.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const s = smoothstep(t);
      bar1EffFracRef.current = startFrac1 + (targetFrac1 - startFrac1) * s;
      bar2EffFracRef.current = startFrac2 + (targetFrac2 - startFrac2) * s;
      renderRef.current?.();
      if (t < 1) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        animFrameRef.current = null;
      }
    }

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [distortionOn]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
      }}
    >
      <svg ref={svgRef} style={{ display: "block" }} />
      <svg ref={indicatorRef} style={{ display: "block", flexShrink: 0 }} />
    </div>
  );
}
