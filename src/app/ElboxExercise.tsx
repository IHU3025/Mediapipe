"use client";

import { useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "@mediapipe/tasks-vision";

export default function ElbowExercise() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [exerciseStep, setExerciseStep] = useState<"extension" | "flexion" | "done" | null>(null);
  const [stepResult, setStepResult] = useState<{ extension?: boolean; flexion?: boolean }>({});
  const [startTime, setStartTime] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string>("");

  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    const createLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1
      });
      setPoseLandmarker(landmarker);
    };

    createLandmarker();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const startWebcam = async () => {
    const video = videoRef.current;
    if (!video || !poseLandmarker) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;

      video.addEventListener("loadeddata", () => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        setWebcamRunning(true);
        setExerciseStep("extension");
        setStepResult({});
        setStartTime(Date.now());
        setFeedback("");
        detectFrame();
      });
    } catch (error) {
      console.error("Error accessing webcam:", error);
    }
  };

  function getAngle(a: any, b: any, c: any): number {
    const ab = { x: a.x - b.x, y: a.y - b.y };
    const cb = { x: c.x - b.x, y: c.y - b.y };
    const dot = ab.x * cb.x + ab.y * cb.y;
    const magAB = Math.sqrt(ab.x ** 2 + ab.y ** 2);
    const magCB = Math.sqrt(cb.x ** 2 + cb.y ** 2);
    const cosine = dot / (magAB * magCB);
    return Math.acos(cosine) * (180 / Math.PI);
  }

  const detectFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !poseLandmarker || !webcamRunning) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawingUtils = new DrawingUtils(ctx);

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = poseLandmarker.detectForVideo(video, performance.now());

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];
        drawingUtils.drawLandmarks(lm);
        drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS);

        const shoulder = lm[11];
        const elbow = lm[13];
        const wrist = lm[15];

        const angle = getAngle(shoulder, elbow, wrist);
        const now = Date.now();

        if (exerciseStep === "extension") {
          if (angle > 160 && !stepResult.extension) {
            setStepResult(prev => ({ ...prev, extension: true }));
            setFeedback("Extension success!");
          } else if (!stepResult.extension) {
            setFeedback("Keep straightening your elbow...");
          }

          if (now - (startTime ?? 0) > 10000) {
            setExerciseStep("flexion");
            setStartTime(Date.now());
            setFeedback("");
          }
        }

        if (exerciseStep === "flexion") {
          if (angle < 60 && !stepResult.flexion) {
            setStepResult(prev => ({ ...prev, flexion: true }));
            setFeedback("Flexion success!");
          } else if (!stepResult.flexion) {
            setFeedback("Keep bending your elbow...");
          }

          if (now - (startTime ?? 0) > 10000) {
            setExerciseStep("done");
            setWebcamRunning(false);
            setFeedback("Exercise complete!");
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(detectFrame);
  };

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={startWebcam}
        className="px-4 py-2 mt-4 bg-blue-500 text-white rounded-lg"
      >
        Start Elbow Exercise
      </button>

      {exerciseStep && exerciseStep !== "done" && (
        <p className="mt-2 text-lg text-gray-700">
          Please {exerciseStep === "extension" ? "straighten" : "bend"} your left elbow
        </p>
      )}

      {feedback && <p className="mt-1 text-sm text-green-600">{feedback}</p>}

      {exerciseStep === "done" && (
        <div className="mt-4 text-lg">
          <p>Extension: {stepResult.extension ? "Success" : "Failed"}</p>
          <p>Flexion: {stepResult.flexion ? "Success" : "Failed"}</p>
        </div>
      )}

      <div className="relative w-full max-w-[640px] mx-auto">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-auto transform -scale-x-100"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none transform -scale-x-100"
        />
      </div>
    </div>
  );
}