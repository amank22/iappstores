import type { SourceDto } from "@iappstores/contracts";

export type SourceDefinition = {
  id: string;
  name: string;
  subtitle: string | null;
  url: string;
  website: string | null;
};

export const SOURCES: SourceDefinition[] = [
  {
    id: "fastsign-altstore",
    name: "FastSign Lite",
    subtitle: "AltStore and SideStore compatible FastSign repository",
    url: "https://fastsign.dev/repo.lite.altstore.json",
    website: "https://fastsign.dev"
  }
];

export function findSource(sourceId: string): SourceDefinition | undefined {
  return SOURCES.find((source) => source.id === sourceId);
}

export function sourceToDto(source: SourceDefinition, appCount?: number): SourceDto {
  return {
    id: source.id,
    name: source.name,
    subtitle: source.subtitle,
    url: source.url,
    website: source.website,
    ...(typeof appCount === "number" ? { appCount } : {})
  };
}
