# Money Validation — the only thing that counts

This is a build-to-earn hackathon. A working demo is table stakes. The scoreboard ranks
projects by **how much real evidence you have that people will pay.**

> The buy button is the only validation. Everything else is an opinion.

## The checklist (your README must answer all 6)

Copy `PROJECT-TEMPLATE.md` into your repo's `README.md` and fill it in.

1. **One sentence.** Who is it for + what painful problem + what do they pay for?
   _Bad:_ "An AI tool for productivity."
   _Good:_ "Shopify store owners pay $29/mo to auto-generate SEO product pages so they
   stop losing hours writing copy."

2. **A real price.** A pricing section with an actual number. No "contact us," no "free
   for now." Pick a price and put it on the page.

3. **A working money mechanism.** At least one of:
   - **Stripe Checkout** — real charge or a $X pre-order/deposit (strongest).
   - **Waitlist** — email capture with a clear "what you're signing up for."
   - **Buy button** — a CTA that leads to a checkout/payment step (even if it 404s the
     first week, you measure intent-to-click).

4. **A tracked funnel.** You must be able to report: **visits → CTA clicks → signups/
   payments.** Any analytics works (Plausible, PostHog, Vercel Analytics, GA, even a
   manual count). No funnel numbers = Level 0, full stop.

5. **A distribution plan.** Where do the first 10 users come from? Name the specific
   channel(s): a subreddit, a Slack/Discord, your DMs, a cold-email list, a marketplace.

6. **A validation target.** Decide *before you build* what "it worked" means. Examples:
   - 10 paying customers, or
   - $100 collected, or
   - 50 waitlist signups with >20% from cold traffic, or
   - 3 signed LOIs / pre-orders.

## Validation levels (this is the leaderboard ranking)

| Level | Proof required | Badge |
|------:|----------------|:-----:|
| **0** | Landing page live on a public URL + analytics firing | — |
| **1** | Real **waitlist signups** (soft demand) | 🥉 |
| **2** | **Pre-orders, LOIs, or written commitments** ("yes, I'd pay $X") | 🥈 |
| **3** | **Real money collected** — even a single $1 charge via Stripe | 🥇 |

**Ranking rules**
- Higher level always beats lower level.
- Tie within a level → higher **revenue collected**, then **signups**, then **conversion rate**.
- A $1 real charge (Level 3) beats 500 waitlist emails (Level 1). Real money is the point.

## How to get to Level 3 fast (the cheap tricks)

- **Pre-sell before you build.** Stripe Payment Link + a one-page pitch. If nobody pays
  the deposit, you just saved yourself the build.
- **Concierge MVP.** Sell the outcome, deliver it manually behind the scenes for the
  first few customers. The "AI" can be you for a week.
- **Founding-member price.** "First 10 customers: 50% off for life." Creates urgency and
  a real transaction.
- **Charge for the waitlist.** A $5 refundable deposit filters tire-kickers and instantly
  moves you from Level 1 to Level 3 evidence.

## What does NOT count

- "My friends said it's cool." (opinion)
- "It got 2,000 page views." (traffic ≠ demand — show the funnel)
- "I'll add payments later." (then you're Level 0)
- A beautiful UI with no CTA. (Level 0)

See `RULES.md` for timeline and demo-day judging. See `IDEAS.md` for vetted, fast-to-money ideas.
