import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import type { InteractionMode } from "./CheckerboardGrid";

const WASM_VERSION = "0.10.35";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${WASM_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

type Props = {
  /** Grid area width in CSS pixels (matches checkerboard main SVG). */
  width: number;
  /** Grid area height in CSS pixels (main SVG only, excluding indicator strip). */
  height: number;
  interactionMode: InteractionMode;
  faceBoundsRef: MutableRefObject<{
    minFr: number;
    maxFr: number;
  } | null>;
  /** When false, landmarks still run for face mode but the SVG mesh is hidden. */
  meshVisible?: boolean;
};

function faceHorizontalExtents(
  landmarks: NormalizedLandmark[],
  w: number,
  mirror: boolean,
): { minFr: number; maxFr: number } | null {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const lm of landmarks) {
    const x = (mirror ? 1 - lm.x : lm.x) * w;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return { minFr: minX / w, maxFr: maxX / w };
}

function buildMeshPathD(
  landmarks: NormalizedLandmark[],
  w: number,
  h: number,
  mirror: boolean,
): string {
  const xAt = (lm: NormalizedLandmark) => (mirror ? 1 - lm.x : lm.x) * w;
  const yAt = (lm: NormalizedLandmark) => lm.y * h;
  const parts: string[] = [];
  for (const { start, end } of FaceLandmarker.FACE_LANDMARKS_TESSELATION) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) continue;
    parts.push(
      `M${xAt(a).toFixed(2)},${yAt(a).toFixed(2)}L${xAt(b).toFixed(2)},${yAt(b).toFixed(2)}`,
    );
  }
  return parts.join("");
}

async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const wasm = await FilesetResolver.forVisionTasks(WASM_BASE);
  const opts = {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU" as const,
    },
    runningMode: "VIDEO" as const,
    numFaces: 1,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };
  try {
    return await FaceLandmarker.createFromOptions(wasm, opts);
  } catch {
    return await FaceLandmarker.createFromOptions(wasm, {
      ...opts,
      baseOptions: { ...opts.baseOptions, delegate: "CPU" },
    });
  }
}

/**
 * Runs MediaPipe Face Landmarker on the webcam and draws the tesselation mesh
 * into an SVG sized to `width` × `height`.
 */
export default function FaceMeshOverlay({
  width,
  height,
  interactionMode,
  faceBoundsRef,
  meshVisible = true,
}: Props) {
  const interactionModeRef = useRef(interactionMode);
  useLayoutEffect(() => {
    interactionModeRef.current = interactionMode;
  }, [interactionMode]);

  const meshVisibleRef = useRef(meshVisible);
  useLayoutEffect(() => {
    meshVisibleRef.current = meshVisible;
  }, [meshVisible]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (width <= 0 || height <= 0) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const pathEl = pathRef.current;
    if (!video || !canvas || !pathEl) return;

    let cancelled = false;

    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    (async () => {
      let landmarker: FaceLandmarker;
      try {
        landmarker = await createFaceLandmarker();
      } catch (e) {
        console.error("FaceLandmarker failed to load", e);
        return;
      }
      if (cancelled) {
        landmarker.close();
        return;
      }
      landmarkerRef.current = landmarker;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          landmarker.close();
          return;
        }
        streamRef.current = stream;
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
      } catch (e) {
        console.error("getUserMedia failed", e);
        landmarker.close();
        landmarkerRef.current = null;
        return;
      }

      if (cancelled) return;

      const drawFrame = () => {
        if (cancelled) return;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw > 0 && vh > 0 && landmarkerRef.current) {
          const cw = canvas.width;
          const ch = canvas.height;
          const scale = Math.max(cw / vw, ch / vh);
          const dw = vw * scale;
          const dh = vh * scale;
          const ox = (cw - dw) / 2;
          const oy = (ch - dh) / 2;
          ctx.drawImage(video, ox, oy, dw, dh);
          const result = landmarkerRef.current.detectForVideo(
            canvas,
            performance.now(),
          );
          const face = result.faceLandmarks[0];
          if (interactionModeRef.current === "face") {
            if (face) {
              const ext = faceHorizontalExtents(face, cw, true);
              faceBoundsRef.current = ext;
            } else {
              faceBoundsRef.current = null;
            }
          } else {
            faceBoundsRef.current = null;
          }
          if (face && meshVisibleRef.current) {
            pathEl.setAttribute("d", buildMeshPathD(face, cw, ch, true));
            pathEl.setAttribute("opacity", "0.85");
          } else {
            pathEl.setAttribute("d", "");
            pathEl.setAttribute("opacity", "0");
          }
        }
        rafRef.current = requestAnimationFrame(drawFrame);
      };

      rafRef.current = requestAnimationFrame(drawFrame);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
      faceBoundsRef.current = null;
      pathEl.setAttribute("d", "");
    };
  }, [width, height, faceBoundsRef]);

  if (width <= 0 || height <= 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width,
        height,
        pointerEvents: "none",
      }}
    >
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          width: "auto",
          height,
          left: "50%",
          transform: "translateX(-50%)",
          opacity: 0,
          pointerEvents: "none",
        }}
      />
      <canvas ref={canvasRef} hidden />
      <svg
        width={width}
        height={height}
        style={{ display: "block", overflow: "visible" }}
        aria-hidden
      >
        <path
          ref={pathRef}
          fill="none"
          stroke="rgba(170, 59, 255, 0.65)"
          strokeWidth={1}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
