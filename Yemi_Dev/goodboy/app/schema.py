"""Shared value types for the GoodBoy trainer."""
from dataclasses import dataclass


@dataclass
class Detection:
    """One RF-DETR detection."""
    label: str
    conf: float
    box: tuple  # (x1, y1, x2, y2) in pixels


@dataclass
class RecognizedTrick:
    """What the recognizer believes the dog is currently doing."""
    name: str          # "sit" | "down" | "stand"
    confidence: float
    stable: bool       # held long enough to be trusted
