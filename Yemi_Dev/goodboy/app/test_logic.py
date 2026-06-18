"""Pure-logic tests for the verify engine + recognizer (no model, no camera).

Run from the goodboy folder:
    spike/.venv/Scripts/python.exe -m app.test_logic
"""
import random

from app.engine import VerifierEngine
from app.recognizer import StaticPostureRecognizer
from app.schema import Detection, RecognizedTrick


def test_engine_success_and_streak():
    t = [0.0]
    e = VerifierEngine(timeout=5, cooldown=1, rng=random.Random(0), clock=lambda: t[0])
    cmd = e.issue()
    assert e.state == "waiting" and cmd in e.commands

    # unstable match -> ignored
    e.handle(RecognizedTrick(cmd, 0.9, stable=False))
    assert e.state == "waiting" and e.score == 0

    # wrong stable -> ignored (lenient: only timeout fails)
    wrong = next(c for c in e.commands if c != cmd)
    e.handle(RecognizedTrick(wrong, 0.9, stable=True))
    assert e.state == "waiting" and e.score == 0

    # correct stable -> success
    e.handle(RecognizedTrick(cmd, 0.9, stable=True))
    assert e.state == "success" and e.score == 1 and e.streak == 1

    # cooldown -> auto-advance to next command
    t[0] = 1.01
    e.tick()
    assert e.state == "waiting" and e.attempts == 1


def test_engine_timeout_breaks_streak():
    t = [0.0]
    e = VerifierEngine(timeout=5, cooldown=1, rng=random.Random(1), clock=lambda: t[0])
    cmd = e.issue()
    e.handle(RecognizedTrick(cmd, 0.9, stable=True))
    assert e.streak == 1
    # next command, then miss it
    t[0] = 1.01
    e.tick()
    assert e.state == "waiting"
    t[0] = 100.0
    e.tick()
    assert e.state == "fail" and e.streak == 0


def test_recognizer_debounce():
    r = StaticPostureRecognizer(window=6, min_hits=4, min_conf=0.4)
    box = (0, 0, 10, 10)
    # a single flicker is NOT stable
    out = r.update([Detection("sit", 0.9, box)])
    assert out.name == "sit" and out.stable is False
    # sustained -> stable
    for _ in range(4):
        out = r.update([Detection("sit", 0.9, box)])
    assert out.name == "sit" and out.stable is True
    # low-confidence detections don't count
    r.reset()
    for _ in range(6):
        out = r.update([Detection("stand", 0.2, box)])
    assert out is None


def test_recognizer_picks_highest_conf_posture():
    r = StaticPostureRecognizer(window=4, min_hits=2, min_conf=0.4)
    box = (0, 0, 10, 10)
    for _ in range(2):
        out = r.update([Detection("sit", 0.5, box), Detection("down", 0.95, box)])
    assert out.name == "down" and out.stable is True


def main():
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for fn in tests:
        fn()
        print(f"  PASS {fn.__name__}")
    print(f"\nAll {len(tests)} logic tests passed.")


if __name__ == "__main__":
    main()
