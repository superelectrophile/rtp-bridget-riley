import { useEffect, useRef } from "react";
import * as d3 from "d3";

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h},${s}%,${l}%)`;
}

const BAR_WIDTH = 3;
const INDICATOR_HEIGHT = 36;
const DISTORTION_AMPLITUDE = 0.85; // a: max fraction of rx removed at bar center
const DISTORTION_SPREAD = 80; // b: gaussian falloff width in pixels

function distortionFactor(ux: number, bar1X: number, bar2X: number): number {
  const g1 = DISTORTION_AMPLITUDE * Math.exp(-(((ux - bar1X) / DISTORTION_SPREAD) ** 2));
  const g2 = DISTORTION_AMPLITUDE * Math.exp(-(((ux - bar2X) / DISTORTION_SPREAD) ** 2));
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
  bar2X: number
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
}

export default function CheckerboardGrid({ cellSize = 24 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const indicatorRef = useRef<SVGSVGElement>(null);
  const bar1FractionRef = useRef(0.33);
  const bar2FractionRef = useRef(0.67);

  useEffect(() => {
    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    const indicator = d3.select(indicatorRef.current);

    function updateIndicator(svgWidth: number) {
      const positions = [
        bar1FractionRef.current * svgWidth,
        bar2FractionRef.current * svgWidth,
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
        .attr("fill", hsl(0, 0, 0));
    }

    function draw() {
      if (!container) return;
      const cols = Math.floor(container.clientWidth / cellSize);
      const rows = Math.floor((container.clientHeight - INDICATOR_HEIGHT) / cellSize);
      const svgWidth = cols * cellSize;
      const svgHeight = rows * cellSize;
      const radius = cellSize / 2;

      svg.attr("width", svgWidth).attr("height", svgHeight);

      svg.selectAll("ellipse").remove();
      const cells: [number, number][] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((c + r) % 2 === 0) cells.push([c, r]);
        }
      }

      const bar1X = bar1FractionRef.current * svgWidth;
      const bar2X = bar2FractionRef.current * svgWidth;
      const { centers, widths } = computeLayout(cols, cellSize, bar1X, bar2X);

      svg
        .selectAll("ellipse")
        .data(cells)
        .join("ellipse")
        .attr("cx", ([c]) => centers[c])
        .attr("cy", ([, r]) => r * cellSize + cellSize / 2)
        .attr("rx", ([c]) => widths[c] / 2)
        .attr("ry", radius)
        .attr("fill", hsl(0, 0, 0))
        .attr("stroke", "none");

      function updateEllipses(p1: number, p2: number) {
        const { centers: newCenters, widths: newWidths } = computeLayout(cols, cellSize, p1, p2);
        svg
          .selectAll<SVGEllipseElement, [number, number]>("ellipse")
          .attr("cx", ([c]) => newCenters[c])
          .attr("rx", ([c]) => newWidths[c] / 2);
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
        d3.drag<SVGRectElement, unknown>().on("drag", (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
          const newX = Math.max(0, Math.min(svgWidth, event.x));
          bar1FractionRef.current = newX / svgWidth;
          bar1.attr("x", newX - BAR_WIDTH / 2);
          updateEllipses(newX, bar2FractionRef.current * svgWidth);
          updateIndicator(svgWidth);
        })
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
        d3.drag<SVGRectElement, unknown>().on("drag", (event: d3.D3DragEvent<SVGRectElement, unknown, unknown>) => {
          const newX = Math.max(0, Math.min(svgWidth, event.x));
          bar2FractionRef.current = newX / svgWidth;
          bar2.attr("x", newX - BAR_WIDTH / 2);
          updateEllipses(bar1FractionRef.current * svgWidth, newX);
          updateIndicator(svgWidth);
        })
      );

      updateIndicator(svgWidth);
    }

    draw();

    const observer = new ResizeObserver(draw);
    if (container) observer.observe(container);
    return () => observer.disconnect();
  }, [cellSize]);

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
