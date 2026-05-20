import type { Metadata } from "next";
import { getSiteUrl, siteDescription } from "@/lib/site";
import "./globals.css";
import "react-photo-view/dist/react-photo-view.css";
import { Manrope } from "next/font/google";
import Script from "next/script";
import { cn } from "@/lib/utils";

const googleAnalyticsId = "G-VSPK9T0VT9";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "iappstores - IPA Downloads & AltStore Repositories",
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
    title: "iappstores - IPA Downloads & AltStore Repositories",
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
    title: "iappstores - IPA Downloads & AltStore Repositories",
    description: siteDescription,
    images: ["/og.svg"]
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "64x64"
      },
      {
        url: "/favicon.png",
        type: "image/png",
        sizes: "64x64"
      },
      {
        url: "/favicon.svg",
        type: "image/svg+xml"
      }
    ],
    shortcut: "/favicon.ico",
    apple: "/logo.svg"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", manrope.variable)}>
      <body>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${googleAnalyticsId}');`}
        </Script>
        {children}
      </body>
    </html>
  );
}
