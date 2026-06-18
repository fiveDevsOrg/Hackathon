import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm-charcoal dark base (not pure black) for a friendlier, premium feel
        ink: {
          DEFAULT: "#0E0D0C",
          900: "#0E0D0C",
          800: "#16140F",
          700: "#1E1B15",
          600: "#2A251D",
        },
        bone: "#F6EFE4",
        muted: "#A39A8B",
        ember: {
          DEFAULT: "#FF6B35",
          300: "#FF8A5E",
          500: "#FF6B35",
          600: "#F2581F",
          700: "#D8430F",
        },
        leaf: "#7BD389",
        sky: "#5BC0EB",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,107,53,0.25), 0 18px 60px -18px rgba(255,107,53,0.45)",
        card: "0 24px 70px -28px rgba(0,0,0,0.85)",
        inset: "inset 0 1px 0 0 rgba(255,255,255,0.05)",
      },
      backgroundImage: {
        "grain":
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E\")",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(18px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scan": {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "12%": { opacity: "1" },
          "88%": { opacity: "1" },
          "100%": { transform: "translateY(220%)", opacity: "0" },
        },
        "pop-badge": {
          "0%": { transform: "scale(0.7)", opacity: "0" },
          "60%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "tail-wag": {
          "0%,100%": { transform: "rotate(-16deg)" },
          "50%": { transform: "rotate(18deg)" },
        },
        "blink-rec": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.2" },
        },
        "float-soft": {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-7px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.8s cubic-bezier(0.22,1,0.36,1) forwards",
        scan: "scan 3.4s ease-in-out infinite",
        "pop-badge": "pop-badge 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "tail-wag": "tail-wag 0.6s ease-in-out infinite",
        "blink-rec": "blink-rec 1.4s ease-in-out infinite",
        "float-soft": "float-soft 5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
