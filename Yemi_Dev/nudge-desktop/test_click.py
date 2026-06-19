"""Does pynput's global mouse listener fire on this machine?"""
import time

from pynput import mouse

hits = []


def on_click(x, y, b, pressed):
    hits.append(("press" if pressed else "release", x, y))


l = mouse.Listener(on_click=on_click)
l.start()
time.sleep(0.4)
print("listener.running =", l.running)

ctrl = mouse.Controller()
orig = ctrl.position
try:
    ctrl.position = (2, 2)  # harmless top-left corner
    time.sleep(0.1)
    ctrl.click(mouse.Button.left, 1)
    time.sleep(0.3)
finally:
    ctrl.position = orig  # restore the user's cursor
time.sleep(0.2)
l.stop()
print("click events caught:", hits)
