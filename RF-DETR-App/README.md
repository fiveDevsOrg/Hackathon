# Gesture Lab

Static Web App MVP for capturing hand gestures and testing them in a sandbox environment. The camera image stays hidden, but MediaPipe Hand Landmarker still uses it as the input source.

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

The Azure CLI in this environment does not expose `az staticwebapp deploy`, so deployment uses the Azure Static Web Apps CLI:

```bash
TOKEN="$(az staticwebapp secrets list --name RF-DETR-App --resource-group FiveDevs --query properties.apiKey --output tsv)"
npx --yes @azure/static-web-apps-cli deploy /home/christopher/Hackathon/RF-DETR-App --deployment-token "$TOKEN" --env production
```

## Current Behavior

- Uses the local browser camera as hidden gesture input.
- Loads MediaPipe Hand Landmarker in the browser.
- Capture mode records user-controlled gesture samples with no fixed 2.2-second window.
- Samples are stored in browser `localStorage`.
- Capture supports labels for pinch click, pinch drag, swipe left, swipe right, zoom in, and zoom out.
- Sandbox mode renders draggable/zoomable/swipe-selectable items.
- Pinch grabs and drags the selected item.
- Two hands zoom the selected item in or out.
- Swipe left or right changes the selected item.

## Code Structure

- `src/app.js`: camera lifecycle, mode switching, hand tracker loop, and UI metrics.
- `src/gesture-trainer.js`: capture storage, sandbox interactions, hand trails, and gesture sample summaries.
- `src/hand-tracker.js`: MediaPipe Hand Landmarker wrapper.
- `src/three-scene.js`: Three.js camera, renderer, lighting, and background arena.
- `models/`: placeholder for future model assets.

## Next Technical Steps

- Add export/import for captured gesture datasets.
- Add per-gesture sample browser and delete controls.
- Add calibration for each user hand range and movement speed.
- Add smoothing for fingertip positions.
- Add scoring summaries for recorded samples.
- Train or template-match against stored samples once enough examples are captured.
