# RF-DETR Model Assets

Place exported RF-DETR browser inference assets here when they are available.

Expected starting point:

- `rfdetr-manifest.json`: model metadata and class labels
- model weights/runtime files referenced by the manifest

The current MVP uses the local camera and an adapter in `src/detector.js`. When RF-DETR assets are available, wire the `tryCreateRfDetrDetector` function to the selected browser runtime and return detections in this shape:

```json
{
  "label": "head + shoulders",
  "score": 0.92,
  "box": {
    "x": 100,
    "y": 80,
    "width": 320,
    "height": 420
  }
}
```
