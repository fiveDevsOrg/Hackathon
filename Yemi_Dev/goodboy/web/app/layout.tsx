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
  metadataBase: new URL("https://goodboy-alpha.vercel.app"),
  title: "GoodBoy — Train your dog at home. The AI checks its work.",
  description:
    "Free in-browser AI dog trainer: point your camera, it calls SIT, and a state-of-the-art vision model verifies your dog actually did it — 95% accuracy. Try it free, no signup. Founding access $6/mo for life.",
  keywords: [
    "dog training app",
    "AI dog trainer",
    "puppy training",
    "RF-DETR",
    "train dog at home",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "GoodBoy — The AI that checks your dog's homework",
    description:
      "Point your camera. GoodBoy calls SIT and verifies your dog actually did it. Try it free in your browser — no signup.",
    type: "website",
    siteName: "GoodBoy",
    url: "https://goodboy-alpha.vercel.app",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "GoodBoy — AI dog trainer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GoodBoy — The AI that checks your dog's homework",
    description:
      "Point your camera. GoodBoy calls SIT and verifies your dog actually did it. Try it free in your browser.",
    images: ["/og.png"],
  },
};

const PRODUCT_LD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "GoodBoy — AI Dog-Trick Trainer",
  description:
    "An AI clicker-trainer that watches your dog through the camera and verifies sit, down, and stand in real time.",
  brand: { "@type": "Brand", name: "GoodBoy" },
  offers: {
    "@type": "Offer",
    price: "6.00",
    priceCurrency: "USD",
    description: "Founding member — $6/mo for life (50% off), $7 refundable deposit.",
    availability: "https://schema.org/PreOrder",
    url: "https://goodboy-alpha.vercel.app/#pricing",
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_LD) }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
