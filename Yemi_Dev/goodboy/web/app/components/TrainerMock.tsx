/**
 * The "live trainer" product mock used in the hero.
 * A framed webcam feed: CSS/SVG dog in a sit pose, animated detection box,
 * confidence badge, scan line, REC light, and a session scoreboard.
 * Pure CSS/SVG — no images, no external services.
 */
export default function TrainerMock() {
  return (
    <div className="relative w-full max-w-[460px] mx-auto">
      {/* Floating scoreboard chip (top-right, overlapping the frame) */}
      <div className="absolute -top-5 -right-3 z-20 hidden sm:block animate-float-soft">
        <div className="rounded-2xl border border-white/10 bg-ink-800/90 backdrop-blur px-4 py-3 shadow-card">
          <div className="flex items-center gap-3">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Streak
              </div>
              <div className="font-display text-2xl font-semibold text-bone leading-none">
                4 <span className="text-ember text-base">🔥</span>
              </div>
            </div>
            <div className="h-9 w-px bg-white/10" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
                Accuracy
              </div>
              <div className="font-display text-2xl font-semibold text-leaf leading-none">
                92%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phone/camera frame */}
      <div className="relative rounded-[2rem] border border-white/10 bg-gradient-to-b from-ink-700 to-ink-900 p-3 shadow-card">
        {/* Camera viewport */}
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.4rem] bg-[#0a1410] ring-1 ring-inset ring-white/5">
          {/* "Floor" vignette + room gradient so it reads like a real living-room feed */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,#16302a_0%,#0c1a16_55%,#070d0b_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(to_top,rgba(0,0,0,0.55),transparent)]" />

          {/* Scan line */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 animate-scan bg-[linear-gradient(to_bottom,transparent,rgba(123,211,137,0.22),transparent)]" />

          {/* Top HUD row: REC + timestamp + model tag */}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-3.5 py-3 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-1 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-ember animate-blink-rec" />
              <span className="tracking-[0.2em] text-bone/90">REC</span>
            </div>
            <div className="rounded-full bg-black/40 px-2 py-1 tracking-[0.12em] text-bone/70 backdrop-blur">
              RF-DETR · 0:08
            </div>
          </div>

          {/* The dog (sitting pose) + detection box, centered low */}
          <div className="absolute inset-0 flex items-end justify-center pb-[14%]">
            <div className="relative">
              {/* Detection box */}
              <div className="absolute -inset-x-6 -top-[8%] bottom-[-4%] rounded-md border-2 border-leaf shadow-[0_0_24px_rgba(123,211,137,0.35)]">
                {/* corner ticks */}
                <span className="absolute -left-[3px] -top-[3px] h-3 w-3 border-l-2 border-t-2 border-leaf" />
                <span className="absolute -right-[3px] -top-[3px] h-3 w-3 border-r-2 border-t-2 border-leaf" />
                <span className="absolute -left-[3px] -bottom-[3px] h-3 w-3 border-l-2 border-b-2 border-leaf" />
                <span className="absolute -right-[3px] -bottom-[3px] h-3 w-3 border-r-2 border-b-2 border-leaf" />

                {/* Confidence badge anchored to box top-left */}
                <div className="absolute -top-7 left-0 origin-bottom-left animate-pop-badge">
                  <div className="flex items-center gap-1.5 rounded-md bg-leaf px-2 py-1 font-mono text-[11px] font-bold text-[#0a1f12] shadow-lg">
                    <span>SIT</span>
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M20 6 9 17l-5-5"
                        stroke="#0a1f12"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="tabular-nums">0.92</span>
                  </div>
                </div>
              </div>

              <DogSitting />
            </div>
          </div>

          {/* Bottom command bar — the app calling the cue */}
          <div className="absolute inset-x-0 bottom-0 z-10 px-3.5 pb-3.5">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/45 px-3 py-2.5 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-ember/20 text-sm">
                  🔊
                </span>
                <div className="leading-tight">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-muted font-mono">
                    Now cueing
                  </div>
                  <div className="text-sm font-semibold text-bone">
                    &ldquo;Good sit!&rdquo;
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-leaf/15 px-2.5 py-1.5 text-center">
                <div className="font-mono text-[10px] text-leaf">VERIFIED</div>
                <div className="text-[10px] text-bone/60 font-mono">+10 pts</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Caption under the frame */}
      <p className="mt-4 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
        Live verification · not a stock photo
      </p>
    </div>
  );
}

/** A friendly dog in a clean sit pose, drawn as SVG with a wagging tail. */
function DogSitting() {
  return (
    <svg
      width="170"
      height="190"
      viewBox="0 0 170 190"
      fill="none"
      className="drop-shadow-[0_18px_22px_rgba(0,0,0,0.55)]"
      role="img"
      aria-label="A dog sitting, detected by GoodBoy"
    >
      {/* contact shadow */}
      <ellipse cx="85" cy="180" rx="60" ry="9" fill="rgba(0,0,0,0.45)" />

      {/* wagging tail (animated, behind body) */}
      <g
        className="animate-tail-wag"
        style={{ transformOrigin: "132px 130px" }}
      >
        <path
          d="M132 132 C150 120 160 104 150 92 C146 110 138 120 128 126 Z"
          fill="#C98A4B"
        />
      </g>

      {/* haunches / seated rear */}
      <path
        d="M44 176 C30 176 26 150 38 128 C50 108 78 104 96 120 C112 134 110 170 96 176 Z"
        fill="#D69A57"
      />
      {/* front legs */}
      <rect x="70" y="138" width="16" height="40" rx="8" fill="#E2A862" />
      <rect x="92" y="138" width="16" height="40" rx="8" fill="#D69A57" />
      {/* paws */}
      <ellipse cx="78" cy="178" rx="11" ry="6" fill="#F0BC7A" />
      <ellipse cx="100" cy="178" rx="11" ry="6" fill="#E2A862" />

      {/* chest / body */}
      <path
        d="M62 150 C58 118 70 92 92 90 C116 88 128 112 124 146 C122 164 110 172 92 172 C74 172 64 166 62 150 Z"
        fill="#E2A862"
      />
      {/* chest fluff */}
      <path
        d="M84 150 C82 130 88 112 96 112 C104 112 108 132 104 150 C100 162 88 162 84 150 Z"
        fill="#F3CD96"
      />

      {/* head */}
      <g style={{ transformOrigin: "96px 70px" }}>
        {/* ears */}
        <path d="M64 44 C54 30 60 14 74 22 C82 30 80 50 74 58 Z" fill="#B97B3F" />
        <path
          d="M128 44 C138 30 132 14 118 22 C110 30 112 50 118 58 Z"
          fill="#B97B3F"
        />
        {/* skull */}
        <ellipse cx="96" cy="64" rx="40" ry="36" fill="#E9B470" />
        {/* muzzle */}
        <path
          d="M78 74 C78 92 114 92 114 74 C114 64 78 64 78 74 Z"
          fill="#F3CD96"
        />
        {/* eyes */}
        <circle cx="83" cy="60" r="5.5" fill="#241405" />
        <circle cx="109" cy="60" r="5.5" fill="#241405" />
        <circle cx="84.6" cy="58.4" r="1.6" fill="#fff" />
        <circle cx="110.6" cy="58.4" r="1.6" fill="#fff" />
        {/* brows */}
        <path
          d="M76 50 C80 47 86 47 90 49"
          stroke="#B97B3F"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M102 49 C106 47 112 47 116 50"
          stroke="#B97B3F"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* nose */}
        <ellipse cx="96" cy="74" rx="6.5" ry="5" fill="#241405" />
        {/* happy open mouth + tongue */}
        <path
          d="M88 80 C90 86 102 86 104 80"
          stroke="#241405"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M93 83 C93 92 100 92 100 83 Z"
          fill="#F26D6D"
        />
      </g>
    </svg>
  );
}
