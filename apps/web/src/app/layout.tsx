import type { Metadata } from "next";
import { getSiteUrl, siteDescription } from "@/lib/site";
import "./globals.css";
import { Noto_Serif, Manrope, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

const manropeHeading = Manrope({subsets:['latin'],variable:'--font-heading'});

const notoSerif = Noto_Serif({subsets:['latin'],variable:'--font-serif'});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "iappstores - IPA Downloads, Tweaked Apps, and AltStore Repositories",
    template: "%s | iappstores"
  },
  description: siteDescription,
  keywords: [
    "IPA download",
    "direct IPA download",
    "tweaked IPA",
    "modded IPA",
    "patched iOS apps",
    "AltStore repositories",
    "SideStore repositories",
    "iOS app repositories"
  ],
  openGraph: {
    title: "iappstores - IPA Downloads and Tweaked iOS Apps",
    description: siteDescription,
    url: "/",
    siteName: "iappstores",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "iappstores IPA repository browser"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "iappstores - IPA Downloads and Tweaked iOS Apps",
    description: siteDescription,
    images: ["/og.svg"]
  },
  icons: {
    icon: [
      {
        url: "/favicon.svg",
        type: "image/svg+xml"
      }
    ],
    shortcut: "/favicon.svg",
    apple: "/logo.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark font-serif", notoSerif.variable, manropeHeading.variable, "font-mono", jetbrainsMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
