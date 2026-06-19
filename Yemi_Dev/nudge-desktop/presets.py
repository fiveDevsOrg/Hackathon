"""
presets.py — Quick-action chip data for Nudge OS.

Pure data module. Exposes PRESETS: a list of (label, task) tuples that the
main window renders as one-tap "quick action" chips. Each label is a short,
UI-friendly string (<= 12 chars) and each task is a natural-language
instruction the copilot can act on.

This module intentionally has no side effects and no imports, so it can never
fail on import.
"""

# Quick-action chips shown in the UI.
#   label : short button text (kept <= 12 chars so chips stay compact)
#   task  : natural-language instruction handed to the copilot
PRESETS = [
    ("Settings", "open Windows Settings"),
    ("Wi-Fi", "open Wi-Fi settings"),
    ("Bluetooth", "open Bluetooth settings"),
    ("Wallpaper", "change my desktop wallpaper"),
    ("Screenshot", "take a screenshot with Snipping Tool"),
    ("Task Mgr", "open Task Manager"),
]
