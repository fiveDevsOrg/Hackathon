# RF-DETR App

Static Web App MVP for camera-based head and shoulder detection.

## Local Run

Serve this folder over localhost so browser camera permissions work:

```bash
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## Azure Static Web Apps

Deploy from this folder:

```bash
az staticwebapp deploy \
  --name RF-DETR-App \
  --resource-group FiveDevs \
  --source .
```

## RF-DETR Integration

The app is structured around `src/detector.js`.

Current MVP behavior:

- Uses a local camera stream.
- Uses `FaceDetector` when the browser supports it.
- Estimates a head-and-shoulders box from the detected face.
- Falls back to a framing guide when native detection is unavailable.

Next RF-DETR step:

- Export or host an RF-DETR model suitable for browser inference.
- Place model metadata/assets in `models/`.
- Replace `tryCreateRfDetrDetector` with real inference code returning boxes in canvas coordinates.
