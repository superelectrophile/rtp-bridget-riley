import { useEffect, useRef, useState } from "react";
import CheckerboardGrid, {
  INDICATOR_HEIGHT,
  type InteractionMode,
} from "./CheckerboardGrid";
import FaceMeshOverlay from "./FaceMeshOverlay";
import "./App.css";

function App() {
  const [distortionOn, setDistortionOn] = useState(true);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("face");
  const [faceMeshVisible, setFaceMeshVisible] = useState(false);
  const faceBoundsRef = useRef<{ minFr: number; maxFr: number } | null>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
  const [gridSize, setGridSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setGridSize({
        w: Math.round(r.width),
        h: Math.max(0, Math.round(r.height - INDICATOR_HEIGHT)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
        width: "100%",
        height: "100svh",
        gap: 24,
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      <div
        ref={gridWrapRef}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          minHeight: 0,
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
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          paddingTop: 8,
          gap: 12,
        }}
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
      </aside>
    </div>
  );
}

export default App;
