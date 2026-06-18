# GoodBoy — Technical Design

_Design doc for the GoodBoy hackathon MVP. Product/business summary lives in [`../README.md`](../README.md); this file is the build spec._

**Date:** 2026-06-17
**Builder:** @yemi-bot · branch `Yemi_Dev` · folder `Yemi_Dev/goodboy/`

---

## 1. What we're building & why this shape

GoodBoy is an AI dog-trick trainer: point a camera at your dog, the app calls a command ("SIT"), and **RF-DETR verifies the dog actually performed it**, scoring the session like a tireless clicker-trainer.

But this is a **money-validation hackathon** — judging is ranked *only* by validation level (live → waitlist → pre-orders → real money). Cleverness scores nothing directly; it only helps us *sell*. So the design splits into two tracks with deliberately different priorities:

| Track | Purpose | Is it the score? |
|---|---|---|
| **A · Revenue** | Landing page → $7 Stripe deposit → tracked funnel → distribution | **Yes — this is the deliverable.** |
| **B · Product/demo** | RF-DETR trick verifier → hero demo clip + concierge grading | No — it's the seller and the proof-of-real. |

**Build order is money-first:** Track A ships Day 0–1 (Level 0 the moment a public URL + analytics are live), Track B follows Day 1–2 and produces the hero clip that makes Track A convert. We are never blocked on the model — a recorded clip or mockup stands in until the verifier is ready, and a manual "concierge" grade covers the product promise for the first buyers.

---

## 2. Track A — Revenue (the scored deliverable)

### 2.1 Components
- **Landing page** — Next.js (App Router) single page: hero (the verifier clip), the one-sentence pitch, how-it-works (3 steps), pricing ($6/mo founding, $12 launch), one CTA. No secondary CTAs.
- **CTA → Stripe Payment Link** — a single $7 founding deposit. Real charge = Level 3 evidence. Email captured at Stripe checkout = the waitlist.
- **Analytics** — Vercel Analytics for visits + a custom `cta_click` event so the funnel (visits → clicks → deposits) is reportable. `$ collected` comes from the Stripe dashboard.

### 2.2 Deploy
- Vercel project, **Root Directory = `Yemi_Dev/goodboy`** (or `Yemi_Dev/goodboy/web` if we nest the Next app), **production branch = `Yemi_Dev`** — per the repo's one-folder-one-deploy rule.
- Secrets (Stripe keys) live in Vercel env, **never** committed (repo secrets are shared across builders).
- Target URL: `goodboy.vercel.app` (free subdomain — no domain purchase needed for Level 0).

### 2.3 Definition of done (Track A)
Public URL live · pricing with a real number · working $7 Stripe deposit · Vercel Analytics firing with a click event · README funnel table wired to real numbers.

---

## 3. Track B — RF-DETR trick verifier (the seller)

The CV design. Chosen approach: **posture-as-class now (A), temporal head later (C)** — architected so C is a drop-in.

### 3.1 Four units + the C-later seam
- **`PerceptionLayer`** — webcam/video frame → fine-tuned RF-DETR inference → `Detection{dog_box, posture_class, confidence}`. The only unit that touches the model.
- **`TrickRecognizer`** _(the seam)_ — interface: `update(detections) → RecognizedTrick{name, confidence, stable}`.
  - **A-impl `StaticPostureRecognizer`** — reads the current-frame posture class; applies **temporal debounce** (must hold ≥ K of the last N frames over a confidence threshold) so flicker can't false-trigger. Maintains a small rolling buffer of recent detections/crops.
  - **C-impl `TemporalActionRecognizer`** _(future)_ — consumes that **same rolling buffer** and runs a sequence model for dynamic tricks. Same interface → `VerifierEngine` and UI are unchanged.
- **`VerifierEngine`** — command-loop state machine: issue command → wait for a matching `RecognizedTrick` within a timeout → success/fail → update score, streak, accuracy → next. **Pure logic, zero model dependency** (fully unit-testable with synthetic events).
- **`AppShell` / UI** — issues commands (on-screen + TTS), renders the annotated frame, ✓/✗, clicker audio, scoreboard. Two render targets: a plain **OpenCV full-screen window** (always-works demo) and an optional thin web overlay for polish.

### 3.2 Data flow
```
webcam → frame → RF-DETR → detections → TrickRecognizer.update()
   → (maybe) RecognizedTrick → VerifierEngine.handle()
   → event{command, status, score, streak, annotated_frame} → UI
```

### 3.3 Trick scope
- **Ship (static, reliable):** `dog_sit`, `dog_down`, `dog_stand`.
- **Stretch:** `dog_shake` (works as a posture class — raised paw).
- **Out of scope for the hackathon:** spin, roll-over, weave (dynamic → needs the C temporal head; fragile in a weekend).

### 3.4 Data plan (hybrid)
1. **Bootstrap** — fine-tune RF-DETR-Small on a public dog-posture set (Roboflow Universe sit/stand/lay datasets).
2. **Domain-close** — capture ~30–60 frames of the *actual demo dog* per posture under demo lighting, label in Roboflow, second fine-tune pass. This is what makes it solid on camera.
3. Keep the class set minimal (the 3–4 above).

### 3.5 Model choice
RF-DETR-**Small** (Apache 2.0 — we stay ≤ Large to avoid the PML-1.0 / Roboflow-plan gate on XL/2XL). Nano if FPS-constrained on the demo machine. GPU required at inference (the model is GPU-first; do **not** plan a CPU-laptop demo). TensorRT/ONNX export only if time remains.

### 3.6 Error handling & edge cases
- No dog in frame → "show me your dog" state, no penalty.
- Multiple dogs → take the largest / highest-confidence box.
- `sit` vs `down` ambiguity → require a confidence **margin** between the top-2 classes before accepting.
- Command timeout → fail + offer retry.
- Low light / off-angle → confidence threshold + a "reposition the camera" hint.
- Model flicker → debounce (already core to `StaticPostureRecognizer`).

### 3.7 Concierge fallback
"Upload a clip of your dog, get a graded training report." Delivered **manually** for the first buyers (the README discloses this, per the honesty rules), with RF-DETR automating it post-hackathon. Guarantees the product promise is deliverable even if the live verifier slips.

---

## 4. Tech stack (full)
- **Track A:** Next.js (App Router) · Stripe Payment Link · Vercel Analytics · Vercel hosting.
- **Track B:** Python ≥3.10 · `rfdetr` (RF-DETR-Small) · `supervision` (annotation/video) · OpenCV (capture + overlay) · a TTS engine (Web Speech API in-browser, or `pyttsx3` offline) for the spoken command · NumPy for recognizer/engine logic.
- **Fine-tuning:** Roboflow (dataset export → COCO-JSON → `model.train()`), GPU (Colab/A100 or local).

---

## 5. Testing strategy
- **`VerifierEngine`** — pure unit tests on synthetic `RecognizedTrick` streams: right trick within timeout → pass; wrong/none → fail; cooldown between commands; streak/accuracy math. (TDD this first — no camera needed.)
- **`StaticPostureRecognizer`** — debounce tests: a 1-frame flicker does **not** fire; a sustained K-of-N run does.
- **`PerceptionLayer`** — smoke test: a known "sit" image returns `dog_sit` above threshold.
- **End-to-end** — a recorded clip → asserted pass/fail sequence. (This clip doubles as the demo-day fallback and the landing-page hero.)

---

## 6. Build sequence (1-week, money-first)
| Day | Track | Focus |
|----:|-------|-------|
| **0–1** | A | Landing page + $7 Stripe deposit + analytics live → **public URL = Level 0.** Hero = recorded/mock clip. |
| **1–2** | B | RF-DETR verifier (TDD the engine/recognizer first, then wire perception). Record the real hero clip, swap it into the page. Concierge path ready. |
| **3–5** | A | Drive traffic (Reddit + FB groups + one short). Chase deposits. Daily standup with funnel numbers. |
| **6** | — | Demo day: live URL + funnel + validation level. |

---

## 7. Risks & mitigations
- **Spending the week on CV, finishing Level 0** → money-first build order; Track A ships before the model exists.
- **Dog won't perform on cue / model misses live** → record the hero clip in advance; concierge grading as fallback; OpenCV window over the web overlay for demo robustness.
- **Public-data domain gap** → the second fine-tune pass on real demo-dog frames.
- **"Why RF-DETR?" challenge** → no MediaPipe-for-dogs exists, dog-posture imagery is out-of-distribution (DINOv2 transfer), posture-as-class is RF-DETR-native; the C-later seam shows maturity without building it.
- **Young repo instability** → pin a known-good `rfdetr` version (do not blind-install latest; v1.4.0 was yanked from PyPI).

---

## 8. Open follow-ups (post-approval)
- Confirm final product name (GoodBoy vs alternatives) before buying any domain — not blocking, `goodboy.vercel.app` is free.
- Decide whether the Next app sits at `Yemi_Dev/goodboy/` root or `Yemi_Dev/goodboy/web/` (affects the Vercel Root Directory) — resolved when scaffolding Track A.
