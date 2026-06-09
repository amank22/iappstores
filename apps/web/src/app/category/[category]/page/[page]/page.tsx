import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPageContent, getCategoryMetadata } from "../../category-page";
import { isIndexableCategory } from "@/lib/seo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    category: string;
    page: string;
  }>;
};

function parsePage(value: string): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 0;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category, page: rawPage } = await params;
  const page = parsePage(rawPage);
  if (!isIndexableCategory(category) || page < 1) {
    notFound();
  }

  return getCategoryMetadata(category, page);
}

export default async function CategoryPaginationPage({ params }: PageProps) {
  const { category, page: rawPage } = await params;
  return <CategoryPageContent category={category} page={parsePage(rawPage)} />;
}
