"""TrickRecognizer — turns per-frame detections into a stable RecognizedTrick.

This is the seam in the design: the StaticPostureRecognizer below is the
"A now" implementation (current-frame posture class + temporal debounce). A
future TemporalActionRecognizer can consume the same detection history for
dynamic tricks without changing the engine or UI.
"""
from collections import Counter, deque

from app.schema import RecognizedTrick

POSTURES = ("sit", "down", "stand")


class StaticPostureRecognizer:
    def __init__(self, window=8, min_hits=5, min_conf=0.45):
        self.window = window
        self.min_hits = min_hits
        self.min_conf = min_conf
        self._buf = deque(maxlen=window)

    def update(self, detections):
        """Feed one frame's detections; return the current RecognizedTrick (or None)."""
        postures = [d for d in detections if d.label in POSTURES]
        top = max(postures, key=lambda d: d.conf) if postures else None
        self._buf.append(top.label if (top and top.conf >= self.min_conf) else None)

        counts = Counter(x for x in self._buf if x)
        if not counts:
            return None
        name, hits = counts.most_common(1)[0]
        conf = top.conf if (top and top.label == name) else 0.0
        return RecognizedTrick(name=name, confidence=conf, stable=hits >= self.min_hits)

    def reset(self):
        self._buf.clear()
