# RF-DETR App Session Notes

Date: 2026-06-18
Branch: `Polo_Dev`
Repository: `https://github.com/fiveDevsOrg/Hackathon`
Azure resource group: `FiveDevs`
Azure Static Web App: `RF-DETR-App`
Live URL: `https://green-mushroom-04166ba10.7.azurestaticapps.net`

## Summary

During this session we created the Azure resource group and Static Web App, cloned the GitHub repository into `/home/christopher/Hackathon`, scaffolded the `RF-DETR-App` static web app, and deployed it to Azure Static Web Apps.

The app started as a browser camera MVP for head-and-shoulder detection. We then iterated on the detection and overlay behavior:

- Removed the initial placeholder GitHub connection markdown file from the repo.
- Created `RF-DETR-App/` as the deployable Static Web App folder.
- Added camera access, canvas overlay rendering, status metrics, and Static Web Apps config.
- Fixed Azure Static Web Apps navigation fallback so missing model files are not rewritten to `index.html`.
- Replaced the static framing guide with dynamic MediaPipe detection.
- Replaced the synthetic skeleton with MediaPipe Pose Landmarker.
- Simplified face rendering by removing bunched facial landmark points and using a clean head marker plus upper-body pose lines.
- Added cache-busting query strings for deployed browser modules.

## Current Behavior

The deployed app:

- Uses the local browser camera.
- Loads MediaPipe Pose Landmarker in the browser.
- Draws a green detection box around the upper body.
- Draws pose-based shoulder, arm, hip, torso, and head overlays.
- Falls back to face detection if Pose Landmarker cannot load.
- Shows no pose overlay when no person is detected.

Later game iteration:

- Converted the app into `Slash Rush`, a wrist-controlled target slashing game.
- Hid the camera image and skeleton overlay from the player.
- Kept MediaPipe Pose Landmarker active for wrist tracking.
- Rendered an abstract game arena, wrist cursors, slash trails, targets, hazards, scoring, and round timing.

Current 3D iteration:

- Added a full-bleed Three.js arena layer behind the 2D overlay.
- Converted targets and hazards from 2D canvas drawings into 3D meshes.
- Moved game objects along the Z axis toward the player.
- Kept wrist collision reliable by projecting each 3D target into screen space before hit testing.

## Gesture Control Direction

We discussed evolving the project beyond a slashing game into a hands-based computer control prototype. The likely direction is not RF-DETR-first. RF-DETR is useful for object detection, but hands-as-input needs detailed hand keypoints and temporal gesture recognition.

Recommended base technology:

- Use MediaPipe Hand Landmarker for detailed hand keypoints.
- Keep MediaPipe Pose Landmarker for body/arm context when useful.
- Use RF-DETR later if the app needs object detection, props, body zones, or visual scene understanding.

Gestures to explore:

- Pinch click
- Pinch drag
- Swipe left and right
- Scroll up and down
- Two-hand zoom in and zoom out
- Rotate
- Open palm cancel
- Point/select

Recommended recognition approach:

- Start with rules and state machines for simple gestures.
- Extract features such as pinch distance, fingertip velocity, palm center, hand openness, gesture direction, duration, stability, and confidence.
- Add calibration so the app learns each user's hand range, shoulder width, center position, and natural movement speed.
- Add smoothing such as exponential smoothing or a One Euro filter to reduce jitter.
- Use movement quality metrics such as speed, length, follow-through, angle, accuracy, reaction time, and smoothness.

Potential training/game loop:

1. Show a prompt such as `Zoom in`.
2. Ask the user to perform the gesture.
3. Record hand landmark sequences for 1-2 seconds.
4. Score whether the gesture matched the expected movement.
5. Give feedback and repeat across gestures.
6. Save labeled examples for future classifier training.

Possible classifier path after data collection:

- Dynamic Time Warping template matching for recorded gesture paths.
- A small browser-side classifier using TensorFlow.js or ONNX Runtime Web.
- Sequence models such as GRU, LSTM, or temporal convolution if gestures become too ambiguous for rules.

Near-term recommendation:

- Build a `Gesture Trainer` mode before training a model.
- Implement pinch, swipe, scroll, and zoom with rule-based recognition.
- Record attempts and scores to create a dataset.
- Use the game format to make gesture practice and data collection natural.

Implemented trainer MVP:

- Added a mode toggle between `Slash Game` and `Gesture Trainer`.
- Added MediaPipe Hand Landmarker for detailed hand keypoints.
- Added prompts for `Pinch click`, `Swipe right`, and `Zoom out`.
- Added short attempt windows that capture hand landmark sequences.
- Added rule-based scoring for the first gesture set.
- Added session sample counts for captured gesture attempts.
- Kept the camera hidden while rendering fingertip hints and motion trails.

## Commits From This Session

| Commit | Description |
| --- | --- |
| `d2c9b6e` | Add GitHub repo connection template |
| `ff297ea` | Remove GitHub repo connection template |
| `0e98b6e` | Add RF-DETR static app scaffold |
| `295ba93` | Show camera framing fallback when face detection is empty |
| `7643ce6` | Fix detector startup on missing RF-DETR manifest |
| `6c146a3` | Use dynamic face detector and skeleton overlay |
| `bb9d41b` | Bust browser cache for detector modules |
| `ca59733` | Replace synthetic skeleton with pose landmarker |
| `ccec976` | Simplify pose overlay face rendering |
| `8aaad89` | Add pose-controlled Slash Rush game |
| `1b7b9b6` | Load Slash Rush app module |
| `a457e27` | Hide camera and skeleton during gameplay |
| `5403ab4` | Render Slash Rush targets in Three.js |
| `db5dbb1` | Document gesture control training direction |

## Security Note

A GitHub PAT was accidentally placed in Azure blob markdown content during setup. It was removed from the blob and moved to a local secret file at `/home/christopher/github_hackathon_token.txt` with `600` permissions. The safest follow-up is to revoke or rotate that PAT in GitHub.

## Next Steps

- Test the deployed camera app on the target demo browser/device.
- Tune pose confidence thresholds if detection flickers.
- Decide whether RF-DETR should be used for person/head detection, with Pose Landmarker retained for skeleton overlays.
- Add a real RF-DETR browser model asset or backend inference path when available.
- Prototype MediaPipe Hand Landmarker for pinch/swipe/zoom gestures.
- Add a Gesture Trainer mode that prompts the user, records landmark sequences, scores quality, and stores labeled examples for future model training.
