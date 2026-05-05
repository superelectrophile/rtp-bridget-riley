import { useState } from "react";
import reactLogo from "./assets/react.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";
import CheckerboardGrid from "./CheckerboardGrid";
import "./App.css";

function App() {
  const [count, setCount] = useState(0);

  return (
    <div style={{ width: "50%", height: "100svh" }}>
      <CheckerboardGrid />
    </div>
  );
}

export default App;
