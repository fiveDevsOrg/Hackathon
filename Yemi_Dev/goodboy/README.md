# GoodBoy 🐕

> **One sentence:** New-puppy owners pay a **$7 deposit** to lock **50%-off-for-life** access to an AI trainer that watches their dog through the phone camera and **verifies it actually did the command** — so they train at home without a $90/session pro.

**Builder:** @yemi-bot
**Live URL:** https://goodboy-alpha.vercel.app _(live on Vercel)_
**Stack:** Next.js + Stripe Payment Link + Vercel Analytics (revenue track) · Python + RF-DETR-Small + supervision (product/demo track)

---

## 1. Who pays & for what
First-time and new-puppy owners (0–18 months) who want to train their dog at home but can't afford or schedule a $75–100/session professional trainer. They pay for **confidence that they're doing it right** — an AI that confirms the dog actually performed the command and tracks progress over a structured program.

## 2. Price
- **$7 refundable founding deposit** (this week's offer).
- Deposit locks the **founding price: $6/mo for life** — 50% off the $12/mo launch price.

## 3. Money mechanism
- [x] Stripe Checkout / Payment Link — **$7 founding deposit (real charge → Level 3 evidence)**
- [x] Pre-order / deposit — the $7 is a refundable founding deposit
- [x] Waitlist (email capture) — captured at checkout
- [x] Buy button → checkout

Link: _Stripe Payment Link — created Day 1, embedded as the page's only CTA._

## 4. Funnel (real numbers — update through the week)
| Metric | Count |
|--------|------:|
| Visits | 0 |
| CTA clicks | 0 |
| Signups / waitlist | 0 |
| **Paid customers** | 0 |
| **$ collected** | $0 |

Analytics tool: Vercel Analytics (visits + CTA-click custom event) + Stripe dashboard ($ collected).

## 5. Distribution plan
First 10 from warm + cold, in order:
1. **Reddit** — r/puppy101, r/dogtraining, r/Dogtraining101 (value-first post + a clip, not a drop-link).
2. **Facebook groups** — new-puppy / breed-specific owner groups.
3. **One TikTok/IG short** of the RF-DETR verifier calling "SIT" and a real dog getting a ✓ (also feeds the @aiithingsai faceless channel).
4. **Warm DMs** — dog-owner contacts for the first honest signups (flagged as warm).

## 6. Validation target (set BEFORE building)
**$100 collected from ≥15 founding deposits by Day 6, with ≥30% of deposits from cold traffic.**

---

## Current validation level
<!-- 0 = live+analytics · 1 = waitlist 🥉 · 2 = pre-orders/LOIs 🥈 · 3 = real money 🥇 -->
**Level: 0** _(target: 3)_

## Demo-day notes
5-minute show: (1) the one-sentence pitch; (2) live `goodboy.vercel.app` — landing page + the $7 Stripe deposit working; (3) the funnel numbers visits → clicks → deposits; (4) the RF-DETR verifier hero clip — call "SIT", real dog, live ✓ — as proof the product is real, not vaporware; (5) validation level + did we hit $100/15.

## Build status (shipped)
- ✅ **Live site:** https://goodboy-alpha.vercel.app (Vercel — Level 0: live + analytics)
- ✅ **Model:** RF-DETR-Nano fine-tuned on sit/down/stand — **95.1% posture accuracy** on a held-out test set (self-labeled from the Apache-2.0 HF `dog-pose-cv` set, no manual annotation)
- ✅ **Local trainer:** command-verify app (`app/`) — TTS command → live RF-DETR verify → scoreboard; `optimize_for_inference` confirmed on the RTX 4080; 4 logic tests pass

## Run the local trainer (RTX 4080 + webcam)
```bash
cd Yemi_Dev/goodboy
spike/.venv/Scripts/python.exe -m uvicorn app.server:app --host 127.0.0.1 --port 8000
# open http://127.0.0.1:8000 → "Start session" → show your dog
```
Reproduce the model: `train/prep_data.py` (build dataset) → `train/finetune.py` (fine-tune). Verify: `train/verify_model.py`.

> Full technical design: [`docs/DESIGN.md`](./docs/DESIGN.md)
