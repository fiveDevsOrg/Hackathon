import {
  FilesetResolver,
  HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

export async function createHandTracker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
  );
  const handLandmarker = await createHandLandmarkerWithDelegate(vision, "GPU")
    .catch(() => createHandLandmarkerWithDelegate(vision, "CPU"));

  return {
    label: "MediaPipe hands",
    detect(video, canvas) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return [];
      }

      const result = handLandmarker.detectForVideo(video, performance.now());
      const scale = getObjectFitScale(video, canvas);

      return result.landmarks.map((landmarks, index) => ({
        handedness: result.handednesses?.[index]?.[0]?.categoryName || "Unknown",
        score: result.handednesses?.[index]?.[0]?.score || 0,
        landmarks: landmarks.map((landmark, landmarkIndex) => ({
          index: landmarkIndex,
          x: landmark.x * scale.sourceWidth * scale.scale + scale.offsetX,
          y: landmark.y * scale.sourceHeight * scale.scale + scale.offsetY,
          z: landmark.z,
          visibility: 1
        }))
      }));
    }
  };
}

function createHandLandmarkerWithDelegate(vision, delegate) {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
      delegate
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.45,
    minHandPresenceConfidence: 0.45,
    minTrackingConfidence: 0.45
  });
}

function getObjectFitScale(video, canvas) {
  const videoRatio = video.videoWidth / video.videoHeight;
  const canvasRatio = canvas.width / canvas.height;
  const scale = canvasRatio > videoRatio
    ? canvas.width / video.videoWidth
    : canvas.height / video.videoHeight;

  return {
    scale,
    sourceWidth: video.videoWidth,
    sourceHeight: video.videoHeight,
    offsetX: (canvas.width - video.videoWidth * scale) / 2,
    offsetY: (canvas.height - video.videoHeight * scale) / 2
  };
}
