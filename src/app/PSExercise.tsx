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
  const [exerciseStep, setExerciseStep] = useState<"supination" | "pronation" | "done" | null>(null);
  const [stepResult, setStepResult] = useState<{ supination?: boolean; pronation?: boolean }>({});
  const [startTime, setStartTime] = useState<number | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);

  useEffect(() => {
    const createLandmarker = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );
      const landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/pose_landmarker_full.task",
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
        setExerciseStep("supination");
        setStepResult({});
        setStartTime(Date.now());
        detectFrame();
      });
    } catch (error) {
      console.error("Error accessing webcam:", error);
    }
  };

  const detectFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !poseLandmarker || !webcamRunning) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawingUtils = new DrawingUtils(ctx);

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      const results = await poseLandmarker.detectForVideo(video, performance.now());

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks && results.landmarks.length > 0) {
        const lm = results.landmarks[0];
        drawingUtils.drawLandmarks(lm);
        drawingUtils.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS);

    //const elbow = lm[13]; 
     //   #const wrist = lm[15]; 

        const now = Date.now();

        if (startTime && now - startTime > 20000) {
          if (exerciseStep === "supination") {
            setStepResult(prev => ({ ...prev, supination: false }));
            setExerciseStep("pronation");
            setStartTime(Date.now());
          } else if (exerciseStep === "pronation") {
            setStepResult(prev => ({ ...prev, pronation: false }));
            setExerciseStep("done");
            setWebcamRunning(false);
          }
        }

       // const wristX = wrist.x;
        //const elbowX = elbow.x;

        // if (exerciseStep === "supination" && wristX > elbowX + 0.05) {
        // setStepResult(prev => ({ ...prev, supination: true }));
        // setExerciseStep("pronation");
        // setStartTime(Date.now());
        // }

        // if (exerciseStep === "pronation" && wristX < elbowX - 0.05) {
        // setStepResult(prev => ({ ...prev, pronation: true }));
        // setExerciseStep("done");
        // setWebcamRunning(false);
        // }
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
        Start Forearm Rotation Exercise
      </button>

      {exerciseStep !== "done" && exerciseStep && (
        <p className="mt-2 text-lg text-gray-700">
          Please rotate your arm {exerciseStep === "supination" ? "upward (supination)" : "downward (pronation)"}
        </p>
      )}

      {exerciseStep === "done" && (
        <div className="mt-4 text-lg">
          <p>Supination: {stepResult.supination ? " Success" : " Failed"}</p>
          <p>Pronation: {stepResult.pronation ? " Success" : " Failed"}</p>
        </div>
      )}

      <div className="relative w-full max-w-[640px] mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto transform -scale-x-100" />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none transform -scale-x-100" />
      </div>
    </div>
  );
}
