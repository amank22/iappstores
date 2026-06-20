import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryPageContent, getCategoryMetadata } from "./category-page";
import { isIndexableCategory } from "@/lib/seo";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    category: string;
  }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  if (!isIndexableCategory(category)) {
    notFound();
  }

  return getCategoryMetadata(category);
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  return <CategoryPageContent category={category} page={1} />;
}
