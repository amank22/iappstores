import type { Metadata } from "next";
import { UpdatePage } from "@/components/update-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recently Updated IPAs", description: "Browse recently updated IPA releases from indexed iOS app repositories.", alternates: { canonical: "/updates" } };
export default function UpdatesPage() { return <UpdatePage title="Recently Updated IPAs" description="The latest version releases observed across indexed AltStore and SideStore-compatible repositories." />; }
