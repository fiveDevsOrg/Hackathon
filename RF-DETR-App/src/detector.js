import {
  FaceDetector,
  FilesetResolver,
  PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

export async function createDetector() {
  const rfDetr = await tryCreateRfDetrDetector();

  if (rfDetr) {
    return rfDetr;
  }

  const poseDetector = await tryCreatePoseDetector();

  if (poseDetector) {
    return poseDetector;
  }

  const faceDetector = await tryCreateMediaPipeFaceDetector();

  if (faceDetector) {
    return faceDetector;
  }

  if ("FaceDetector" in window) {
    return createNativeFaceDetector();
  }

  return createNoopDetector();
}

async function tryCreateRfDetrDetector() {
  const manifest = await fetch("./models/rfdetr-manifest.json", { cache: "no-store" }).catch(() => null);

  if (!manifest || !manifest.ok) {
    return null;
  }

  const contentType = manifest.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  const modelConfig = await manifest.json().catch(() => null);

  if (!modelConfig) {
    return null;
  }

  return {
    label: "RF-DETR ready",
    async detect() {
      console.info("RF-DETR model manifest loaded but browser inference is not wired yet.", modelConfig);
      return [];
    }
  };
}

async function tryCreatePoseDetector() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
    );
    const poseLandmarker = await createPoseLandmarkerWithDelegate(vision, "GPU")
      .catch(() => createPoseLandmarkerWithDelegate(vision, "CPU"));

    return {
      label: "MediaPipe pose",
      async detect(video, canvas) {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return [];
        }

        const result = poseLandmarker.detectForVideo(video, performance.now());
        const scale = getObjectFitScale(video, canvas);

        return result.landmarks
          .map((landmarks) => createPoseDetection(landmarks, scale, canvas))
          .filter(Boolean);
      }
    };
  } catch (error) {
    console.warn("MediaPipe pose detector unavailable", error);
    return null;
  }
}

function createPoseLandmarkerWithDelegate(vision, delegate) {
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      delegate
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.45,
    minPosePresenceConfidence: 0.45,
    minTrackingConfidence: 0.45
  });
}

async function tryCreateMediaPipeFaceDetector() {
  try {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
    );
    const faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      minDetectionConfidence: 0.45
    });

    return {
      label: "MediaPipe face",
      async detect(video, canvas) {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return [];
        }

        const result = faceDetector.detectForVideo(video, performance.now());
        const scale = getObjectFitScale(video, canvas);

        return result.detections.map((detection) => {
          const faceBox = scaleMediaPipeBox(detection.boundingBox, scale);
          const upperBodyBox = expandFaceToUpperBody(faceBox, canvas);
          const score = detection.categories?.[0]?.score ?? 0.75;

          return {
            label: "head + shoulders",
            score,
            box: upperBodyBox
          };
        });
      }
    };
  } catch (error) {
    console.warn("MediaPipe detector unavailable", error);
    return null;
  }
}

function createNativeFaceDetector() {
  const faceDetector = new window.FaceDetector({
    fastMode: true,
    maxDetectedFaces: 4
  });

  return {
    label: "Native face",
    async detect(video, canvas) {
      const faces = await faceDetector.detect(video).catch(() => []);
      const scale = getObjectFitScale(video, canvas);

      if (!faces.length) {
        return [];
      }

      return faces.map((face) => {
        const faceBox = scaleBox(face.boundingBox, scale);
        const upperBodyBox = expandFaceToUpperBody(faceBox, canvas);

        return {
          label: "head + shoulders",
          score: 0.82,
          box: upperBodyBox
        };
      });
    }
  };
}

function createPoseDetection(landmarks, scale, canvas) {
  const upperBodyIndexes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 23, 24];
  const points = landmarks
    .map((landmark, index) => ({
      index,
      x: landmark.x * scale.sourceWidth * scale.scale + scale.offsetX,
      y: landmark.y * scale.sourceHeight * scale.scale + scale.offsetY,
      visibility: landmark.visibility ?? landmark.presence ?? 1
    }))
    .filter((point) => point.visibility >= 0.35);
  const upperBodyPoints = points.filter((point) => upperBodyIndexes.includes(point.index));

  if (upperBodyPoints.length < 4) {
    return null;
  }

  const xs = upperBodyPoints.map((point) => point.x);
  const ys = upperBodyPoints.map((point) => point.y);
  const paddingX = canvas.width * 0.035;
  const paddingY = canvas.height * 0.045;
  const minX = clamp(Math.min(...xs) - paddingX, 0, canvas.width);
  const maxX = clamp(Math.max(...xs) + paddingX, 0, canvas.width);
  const minY = clamp(Math.min(...ys) - paddingY, 0, canvas.height);
  const maxY = clamp(Math.max(...ys) + paddingY, 0, canvas.height);
  const score = upperBodyPoints.reduce((total, point) => total + point.visibility, 0) / upperBodyPoints.length;

  return {
    label: "pose landmarks",
    score,
    box: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    },
    landmarks: points
  };
}

function createNoopDetector() {
  return {
    label: "No detector",
    async detect() {
      return [];
    }
  };
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

function scaleBox(box, scale) {
  return {
    x: box.x * scale.scale + scale.offsetX,
    y: box.y * scale.scale + scale.offsetY,
    width: box.width * scale.scale,
    height: box.height * scale.scale
  };
}

function scaleMediaPipeBox(box, scale) {
  return {
    x: box.originX * scale.scale + scale.offsetX,
    y: box.originY * scale.scale + scale.offsetY,
    width: box.width * scale.scale,
    height: box.height * scale.scale
  };
}

function expandFaceToUpperBody(faceBox, canvas) {
  const width = Math.min(canvas.width * 0.72, faceBox.width * 3.4);
  const height = Math.min(canvas.height * 0.76, faceBox.height * 4.2);
  const x = clamp(faceBox.x + faceBox.width / 2 - width / 2, 0, canvas.width - width);
  const y = clamp(faceBox.y - faceBox.height * 0.42, 0, canvas.height - height);

  return { x, y, width, height };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
