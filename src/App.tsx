import { useEffect, useRef, useState } from "react";
import CheckerboardGrid, {
  INDICATOR_HEIGHT,
  type InteractionMode,
} from "./CheckerboardGrid";
import FaceMeshOverlay from "./FaceMeshOverlay";
import "./App.css";

/** Viewport px from the right edge that reveal the config panel. */
const CONFIG_REVEAL_EDGE_PX = 56;

function App() {
  const [distortionOn, setDistortionOn] = useState(true);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("face");
  const [faceMeshVisible, setFaceMeshVisible] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const faceBoundsRef = useRef<{ minFr: number; maxFr: number } | null>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const configPanelRef = useRef<HTMLElement>(null);
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const indicatorH = interactionMode === "debug" ? INDICATOR_HEIGHT : 0;
      setGridSize({
        w: Math.round(r.width),
        h: Math.max(0, Math.round(r.height - indicatorH)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [interactionMode]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth;
      const inRevealZone = e.clientX >= w - CONFIG_REVEAL_EDGE_PX;
      const panel = configPanelRef.current;
      let overPanel = false;
      if (panel) {
        const r = panel.getBoundingClientRect();
        overPanel =
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
      }
      setConfigOpen(inRevealZone || overPanel);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100svh",
        minHeight: "100svh",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        ref={gridWrapRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      >
        <CheckerboardGrid
          distortionOn={distortionOn}
          interactionMode={interactionMode}
          faceBoundsRef={faceBoundsRef}
        />
        <FaceMeshOverlay
          width={gridSize.w}
          height={gridSize.h}
          interactionMode={interactionMode}
          faceBoundsRef={faceBoundsRef}
          meshVisible={faceMeshVisible}
        />
      </div>
      <aside
        ref={configPanelRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          zIndex: 200,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          maxHeight: "100svh",
          overflowY: "auto",
          padding: "20px 24px 24px",
          gap: 12,
          width: "min(100%, 280px)",
          boxSizing: "border-box",
          background: "var(--bg)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow)",
          transform: configOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.22s ease",
          pointerEvents: configOpen ? "auto" : "none",
        }}
        aria-hidden={!configOpen}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <span style={{ fontSize: 13, color: "var(--text-h)" }}>Mode</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="counter"
              onClick={() => setInteractionMode("face")}
              style={{
                opacity: interactionMode === "face" ? 1 : 0.65,
                borderColor:
                  interactionMode === "face"
                    ? "var(--accent-border)"
                    : "transparent",
              }}
            >
              Face
            </button>
            <button
              type="button"
              className="counter"
              onClick={() => setInteractionMode("debug")}
              style={{
                opacity: interactionMode === "debug" ? 1 : 0.65,
                borderColor:
                  interactionMode === "debug"
                    ? "var(--accent-border)"
                    : "transparent",
              }}
            >
              Debug
            </button>
          </div>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setFaceMeshVisible((v) => !v)}
        >
          {faceMeshVisible ? "Face mesh on" : "Face mesh off"}
        </button>
        {interactionMode === "debug" ? (
          <>
            <button
              type="button"
              className="counter"
              onClick={() => setDistortionOn((v) => !v)}
            >
              {distortionOn ? "Distortion on" : "Distortion off"}
            </button>
            <p style={{ fontSize: 14, maxWidth: 200, margin: 0 }}>
              Drag the bars or toggle distortion. Face data is not used for the
              grid.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 14, maxWidth: 200, margin: 0 }}>
            Bars follow your face width; no face blends to an undistorted grid
            like distortion off.
          </p>
        )}
        <p
          style={{
            fontSize: 12,
            color: "var(--text)",
            margin: 0,
            marginTop: 8,
            opacity: 0.85,
          }}
        >
          Move the pointer near the right screen edge to show this panel.
        </p>
      </aside>
    </div>
  );
}

export default App;
