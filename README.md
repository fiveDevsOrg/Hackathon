# fivedevs Hackathon 🏗️💸

Five developers. Five AI app MVPs. One scoreboard: **who can prove people will pay.**

A working demo is the floor. The winner is whoever gets closest to **real dollars.**

## 🤖 Read first — for AI agents & humans

**One repo, many branches. All work happens on a builder's branch — never on `main`.**

1. Find your owner in the table and check out their branch: `git checkout <Owner>_Dev`
2. Do **all** your work on that branch.
3. Each app is its own folder inside the branch: `<Owner>_Dev/<project-name>/`
4. Never commit to `main` or to another builder's branch.

| Builder | Your branch (workstation) |
|---------|---------------------------|
| @yemi-bot | `Yemi_Dev` |
| @PoloXBT | `Polo_Dev` |
| @cryptocvs29-ai | `CvsTony_Dev` |

```text
Yemi_Dev/            <- your branch
├── project-a/       <- its own app + its own deploy (Vercel Root Directory = this folder)
├── project-b/
└── ...
```

Shared rules live here on `main`: [`MONEY-VALIDATION.md`](./MONEY-VALIDATION.md) ·
[`IDEAS.md`](./IDEAS.md) · [`RULES.md`](./RULES.md).

## Start here

1. **Read [`MONEY-VALIDATION.md`](./MONEY-VALIDATION.md)** — the checklist every MVP must
   pass and how the leaderboard is scored. This is the whole game.
2. **Pick an idea from [`IDEAS.md`](./IDEAS.md)** — vetted for fastest path to first paying
   customer — or bring your own. Claim it via an issue: `CLAIM: <idea> — <handle>`.
3. **Read [`RULES.md`](./RULES.md)** — timeline, daily standups, demo-day format, judging.
4. **Copy [`PROJECT-TEMPLATE.md`](./PROJECT-TEMPLATE.md)** into each project folder's
   `README.md` and fill it in.

## How we work

Everything lives under one banner — this **Hackathon** repo.

- **`main` = the banner.** Shared rules + hackathon landing. Rarely touched.
- **Your branch = your workstation.** `Polo_Dev`, `Yemi_Dev`, etc. Host all your projects
  here — one folder per project.
- **One folder = one project = one deploy.** Point your *own* Vercel / Azure / etc. at the
  project folder (set **Root Directory** to it) with your branch as the **production branch**.
  Keep deploy secrets in your own platform, **not** in this repo — repo secrets are shared.

## The scoreboard (live on the [org page](https://github.com/fiveDevsOrg))

| Level | Proof | Badge |
|------:|-------|:-----:|
| 0 | Landing page live + analytics | — |
| 1 | Waitlist signups | 🥉 |
| 2 | Pre-orders / LOIs | 🥈 |
| 3 | **Real money collected** | 🥇 |

## Workstations (branches)

| Branch | Builder |
|--------|---------|
| `main` | shared banner |
| `Yemi_Dev` | @yemi-bot |
| `Polo_Dev` | @PoloXBT |
| `CvsTony_Dev` | @cryptocvs29-ai |
| _branch tbd_ | 5th builder |

Each builder deploys their own branch from their own account.

## The mantra

> The buy button is the only validation. Everything else is an opinion.

Build something 5 people would pay for. Then go prove it.
