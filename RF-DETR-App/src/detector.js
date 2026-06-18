import {
  FaceDetector,
  FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs";

export async function createDetector() {
  const rfDetr = await tryCreateRfDetrDetector();

  if (rfDetr) {
    return rfDetr;
  }

  const mediaPipeDetector = await tryCreateMediaPipeDetector();

  if (mediaPipeDetector) {
    return mediaPipeDetector;
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

async function tryCreateMediaPipeDetector() {
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
