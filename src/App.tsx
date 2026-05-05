import { useState } from "react";
import CheckerboardGrid from "./CheckerboardGrid";
import "./App.css";

function App() {
  const [distortionOn, setDistortionOn] = useState(true);

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
      <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <CheckerboardGrid distortionOn={distortionOn} />
      </div>
      <aside
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          paddingTop: 8,
        }}
      >
        <button
          type="button"
          className="counter"
          onClick={() => setDistortionOn((v) => !v)}
        >
          {distortionOn ? "Distortion on" : "Distortion off"}
        </button>
        <p style={{ fontSize: 14, maxWidth: 200, marginTop: 12 }}>
          Toggle to slide the bars off-screen and remove the horizontal warp.
        </p>
      </aside>
    </div>
  );
}

export default App;
