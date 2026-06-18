export async function createDetector() {
  const rfDetr = await tryCreateRfDetrDetector();

  if (rfDetr) {
    return rfDetr;
  }

  if ("FaceDetector" in window) {
    return createFaceDetector();
  }

  return createFramingDetector();
}

async function tryCreateRfDetrDetector() {
  const manifest = await fetch("./models/rfdetr-manifest.json", { cache: "no-store" }).catch(() => null);

  if (!manifest || !manifest.ok) {
    return null;
  }

  const modelConfig = await manifest.json();

  return {
    label: "RF-DETR ready",
    async detect() {
      console.info("RF-DETR model manifest loaded but browser inference is not wired yet.", modelConfig);
      return [];
    }
  };
}

function createFaceDetector() {
  const faceDetector = new window.FaceDetector({
    fastMode: true,
    maxDetectedFaces: 4
  });

  return {
    label: "FaceDetector MVP",
    async detect(video, canvas) {
      const faces = await faceDetector.detect(video).catch(() => []);
      const scale = getObjectFitScale(video, canvas);

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

function createFramingDetector() {
  return {
    label: "Camera framing MVP",
    async detect(video, canvas) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return [];
      }

      const width = canvas.width * 0.34;
      const height = canvas.height * 0.48;

      return [{
        label: "head + shoulders",
        score: 0.45,
        box: {
          x: (canvas.width - width) / 2,
          y: canvas.height * 0.18,
          width,
          height
        }
      }];
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
