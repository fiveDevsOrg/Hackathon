import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nudge — the AI copilot that points; you click",
  description:
    "Nudge reads the screen, figures out the next step, and puts a glowing arrow on exactly what to tap. You stay in control of every click — the AI never clicks for you. Try the guided sandbox.",
  keywords: [
    "AI copilot",
    "guided overlay",
    "set-of-mark",
    "screen guidance",
    "point and click assistant",
    "RF-DETR",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Nudge — the AI copilot that points; you click",
    description:
      "An AI guided overlay that points at what to click next. You click; the AI never clicks for you. Try the guided sandbox.",
    type: "website",
    siteName: "Nudge",
  },
  twitter: {
    card: "summary_large_image",
    title: "Nudge — the AI copilot that points; you click",
    description:
      "An AI guided overlay that points at what to click next. You click; the AI never clicks for you.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0E0D0C",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="font-sans antialiased bg-ink text-bone">{children}</body>
    </html>
  );
}
