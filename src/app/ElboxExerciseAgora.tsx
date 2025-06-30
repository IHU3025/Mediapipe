"use client";

import { useEffect, useRef, useState } from "react";
import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils
} from "@mediapipe/tasks-vision";

let AgoraRTC: any;
if (typeof window !== "undefined") {
  import("agora-rtc-sdk-ng").then((mod) => {
    AgoraRTC = mod.default;
  });
}

export default function ElbowExercise() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const poseCanvasRef = useRef<HTMLCanvasElement>(null);
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [webcamRunning, setWebcamRunning] = useState(false);
  const [exerciseStep, setExerciseStep] = useState<"extension" | "flexion" | "done" | null>(null);
  const [stepResult, setStepResult] = useState<{ extension?: boolean; flexion?: boolean }>({});
  const [startTime, setStartTime] = useState<number | null>(null);

  const [agoraClient, setAgoraClient] = useState<any>(null);
  const [localTracks, setLocalTracks] = useState<any[]>([]);
  const [remoteUsers, setRemoteUsers] = useState<{ [uid: string]: any }>({});

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
      if (agoraClient) {
        agoraClient.leave();
      }
      localTracks.forEach(track => track.stop());
    };
  }, []);

  const initAgora = async () => {
    if (!AgoraRTC) {
      console.warn("AgoraRTC not available. Skipping Agora init.");
      return null;
    }
    const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
    setAgoraClient(client);

    client.on("user-published", async (user: any, mediaType: "audio" | "video") => {
      await client.subscribe(user, mediaType);
      if (mediaType === "video") {
        setRemoteUsers(prev => ({ ...prev, [user.uid]: user }));
      }
    });

    client.on("user-unpublished", (user: any) => {
      setRemoteUsers(prev => {
        const newUsers = { ...prev };
        delete newUsers[user.uid];
        return newUsers;
      });
    });

    return client;
  };

  const startWebcam = async () => {
    const video = videoRef.current;
    if (!video || !poseLandmarker) return;

    try {
      const client = agoraClient || await initAgora();
      if (!client) return;

      const APP_ID = '1be4a451d0d74ab59de9cf4d572016cb';
      const CHANNEL = 'exercise-channel';
      const TOKEN = null;

      await client.join(APP_ID, CHANNEL, TOKEN);

      const [micTrack, cameraTrack] = await Promise.all([
        AgoraRTC.createMicrophoneAudioTrack(),
        AgoraRTC.createCameraVideoTrack()
      ]);

      setLocalTracks([micTrack, cameraTrack]);
      await client.publish([micTrack, cameraTrack]);

      const webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = webcamStream;
      video.onloadedmetadata = () => {
        video.play();
        const poseCanvas = poseCanvasRef.current;
        if (poseCanvas) {
          poseCanvas.width = video.videoWidth;
          poseCanvas.height = video.videoHeight;
        }
        detectFrame();
      };

      setWebcamRunning(true);
      setExerciseStep("extension");
      setStepResult({});
      setStartTime(Date.now());
    } catch (error) {
      console.error("Error initializing Agora:", error);
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
    const canvas = poseCanvasRef.current;
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
        if (startTime && now - startTime > 20000) {
          if (exerciseStep === "extension") {
            setStepResult(prev => ({ ...prev, extension: false }));
            setExerciseStep("flexion");
            setStartTime(Date.now());
          } else if (exerciseStep === "flexion") {
            setStepResult(prev => ({ ...prev, flexion: false }));
            setExerciseStep("done");
            setWebcamRunning(false);
          }
        }

        if (exerciseStep === "extension" && angle > 160) {
          setStepResult(prev => ({ ...prev, extension: true }));
          setExerciseStep("flexion");
          setStartTime(Date.now());
        }

        if (exerciseStep === "flexion" && angle < 60) {
          setStepResult(prev => ({ ...prev, flexion: true }));
          setExerciseStep("done");
          setWebcamRunning(false);
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
        disabled={webcamRunning}
      >
        {webcamRunning ? "Exercise in Progress" : "Start Elbow Exercise"}
      </button>
      {exerciseStep !== "done" && exerciseStep && (
        <p className="mt-2 text-lg text-gray-700">
          Please {exerciseStep === "extension" ? "straighten" : "bend"} your left elbow
        </p>
      )}
      {exerciseStep === "done" && (
        <div className="mt-4 text-lg">
          <p>Extension: {stepResult.extension ? "Success" : "Failed"}</p>
          <p>Flexion: {stepResult.flexion ? "Success" : "Failed"}</p>
        </div>
      )}
      <div className="relative w-full max-w-[640px] mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-auto transform -scale-x-100" />
        <canvas ref={poseCanvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none transform -scale-x-100" />

        {Object.values(remoteUsers).map(user => (
          <div key={user.uid} className="mt-4">
            <p>Remote User: {user.uid}</p>
            <div
              ref={el => {
                if (el && user.videoTrack) {
                  user.videoTrack.play(el);
                }
              }}
              className="w-full h-48 bg-gray-200"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
