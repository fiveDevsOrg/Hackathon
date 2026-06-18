import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
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
  metadataBase: new URL("https://goodboy.vercel.app"),
  title: "GoodBoy — Train your dog at home. The AI checks its work.",
  description:
    "GoodBoy is an AI dog-trick trainer. Point your camera, it calls a command, and a state-of-the-art vision model (RF-DETR) verifies your dog actually did it. Founding access for $7.",
  keywords: [
    "dog training app",
    "AI dog trainer",
    "puppy training",
    "RF-DETR",
    "train dog at home",
  ],
  openGraph: {
    title: "GoodBoy — Train your dog at home. The AI checks its work.",
    description:
      "An AI clicker-trainer that watches your dog and verifies the trick. Lock founding access for $7.",
    type: "website",
    siteName: "GoodBoy",
  },
  twitter: {
    card: "summary_large_image",
    title: "GoodBoy — The AI that checks your dog's homework",
    description:
      "Point your camera. GoodBoy calls SIT and verifies your dog actually did it. Founding access $7.",
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
      <body className="font-sans antialiased bg-ink text-bone">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
