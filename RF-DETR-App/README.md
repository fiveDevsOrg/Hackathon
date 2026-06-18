# Slash Rush

Static Web App MVP for a pose-controlled browser game. The player uses their wrists as blades to slash incoming green targets while avoiding red hazards.

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

## Current Game Behavior

- Uses the local browser camera.
- Hides the camera image from the player while still using it for pose input.
- Loads MediaPipe Pose Landmarker in the browser.
- Uses wrist landmarks `15` and `16` as slash blades.
- Renders a full-bleed Three.js arena.
- Spawns green target meshes and red hazard meshes in 3D space.
- Moves objects along the Z axis toward the player.
- Scores successful slashes, tracks streaks, and runs a 60-second round.
- Renders wrist cursors, slash trails, and hit effects on the transparent 2D overlay.
- Falls back to face detection if Pose Landmarker cannot load, but game controls require pose landmarks.

## Gesture Trainer Mode

The app also includes a `Gesture Trainer` mode for exploring hands-as-input workflows.

- Loads MediaPipe Hand Landmarker in the browser.
- Prompts the user to perform `Pinch click`, `Swipe right`, and `Zoom out`.
- Records short hand landmark sequences for each attempt.
- Scores movement with simple rule-based gesture checks.
- Tracks the number of captured samples in the session.
- Draws fingertip hints and trails without showing the camera image.

## Code Structure

- `src/app.js`: camera lifecycle, detector loop, and UI metrics.
- `src/detector.js`: RF-DETR placeholder, MediaPipe Pose Landmarker, and face-detection fallbacks.
- `src/game.js`: 3D target spawning, wrist trails, projected collision detection, scoring, and overlay rendering.
- `src/gesture-trainer.js`: gesture prompts, attempt capture, rule-based scoring, and trainer overlay rendering.
- `src/hand-tracker.js`: MediaPipe Hand Landmarker wrapper.
- `src/three-scene.js`: Three.js camera, renderer, tunnel arena, lighting, and target meshes.
- `models/`: placeholder for future RF-DETR browser model assets.

## RF-DETR Integration

Next RF-DETR step:

- Export or host an RF-DETR model suitable for browser inference.
- Place model metadata/assets in `models/`.
- Replace `tryCreateRfDetrDetector` with real inference code returning boxes in canvas coordinates.
- Keep Pose Landmarker for wrist controls and skeleton overlays unless RF-DETR is paired with a keypoint model.
