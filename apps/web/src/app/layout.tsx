import type { Metadata } from "next";
import { getSiteUrl, siteDescription } from "@/lib/site";
import "./globals.css";
import "react-photo-view/dist/react-photo-view.css";
import { Noto_Serif, Manrope, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const googleTagManagerId = "GTM-T8XP9PB3";
const googleTagManagerScript = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${googleTagManagerId}');`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: googleTagManagerScript }} />
      </head>
      <body>
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}
