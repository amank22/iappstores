import type { Metadata } from "next";
import { SponsorAdmin } from "@/components/sponsor-admin";

export const metadata: Metadata = {
  title: "Sponsor admin",
  robots: { index: false, follow: false }
};

export default function SponsorAdminPage() {
  return <SponsorAdmin />;
}
