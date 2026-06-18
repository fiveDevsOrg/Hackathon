"""VerifierEngine — the command-loop state machine.

Pure logic, no model / no camera, so it is fully unit-testable. Drive it with:
  e.issue()            -> picks a target command, state="waiting"
  e.handle(recognized) -> on a stable matching trick => success
  e.tick(now)          -> times out a missed command; auto-advances after cooldown
"""
import random
import time

STATES = ("idle", "waiting", "success", "fail")
COMMANDS = ("sit", "down", "stand")


class VerifierEngine:
    def __init__(self, commands=COMMANDS, timeout=8.0, cooldown=1.6,
                 rng=None, clock=time.monotonic):
        self.commands = tuple(commands)
        self.timeout = timeout
        self.cooldown = cooldown
        self.rng = rng or random.Random()
        self.clock = clock

        self.state = "idle"
        self.target = None
        self.score = 0
        self.streak = 0
        self.best_streak = 0
        self.attempts = 0
        self.successes = 0
        self.last_result = None
        self._deadline = None
        self._next_at = None

    def issue(self, now=None):
        now = self.clock() if now is None else now
        self.target = self._pick()
        self.state = "waiting"
        self.last_result = None
        self._deadline = now + self.timeout
        self._next_at = None
        return self.target

    def handle(self, recognized, now=None):
        if self.state != "waiting" or recognized is None or not recognized.stable:
            return
        now = self.clock() if now is None else now
        if recognized.name == self.target:
            self.state = "success"
            self.score += 1
            self.streak += 1
            self.best_streak = max(self.best_streak, self.streak)
            self.successes += 1
            self.attempts += 1
            self.last_result = "success"
            self._next_at = now + self.cooldown

    def tick(self, now=None):
        now = self.clock() if now is None else now
        if self.state == "waiting" and self._deadline and now >= self._deadline:
            self.state = "fail"
            self.streak = 0
            self.attempts += 1
            self.last_result = "fail"
            self._next_at = now + self.cooldown
        if self.state in ("success", "fail") and self._next_at and now >= self._next_at:
            self.issue(now)

    def snapshot(self):
        acc = round(100 * self.successes / self.attempts) if self.attempts else 0
        return {
            "state": self.state,
            "command": self.target,
            "score": self.score,
            "streak": self.streak,
            "best_streak": self.best_streak,
            "accuracy": acc,
            "attempts": self.attempts,
            "successes": self.successes,
            "last_result": self.last_result,
        }

    def _pick(self):
        opts = [c for c in self.commands if c != self.target] or list(self.commands)
        return self.rng.choice(opts)
