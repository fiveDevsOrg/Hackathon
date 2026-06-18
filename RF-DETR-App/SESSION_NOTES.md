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

## Security Note

A GitHub PAT was accidentally placed in Azure blob markdown content during setup. It was removed from the blob and moved to a local secret file at `/home/christopher/github_hackathon_token.txt` with `600` permissions. The safest follow-up is to revoke or rotate that PAT in GitHub.

## Next Steps

- Test the deployed camera app on the target demo browser/device.
- Tune pose confidence thresholds if detection flickers.
- Decide whether RF-DETR should be used for person/head detection, with Pose Landmarker retained for skeleton overlays.
- Add a real RF-DETR browser model asset or backend inference path when available.
