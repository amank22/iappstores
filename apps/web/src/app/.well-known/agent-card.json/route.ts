import { getAbsoluteUrl } from "@/lib/site";

export function GET(): Response {
  const card = {
    name: "iappstores Catalog Agent",
    version: "1.0.0",
    description:
      "A read-only catalog interface for discovering and searching AltStore and SideStore-compatible iOS app repository metadata, source details, versions, and download options.",
    supportedInterfaces: [
      {
        url: getAbsoluteUrl("/api/search"),
        protocolBinding: "HTTP+JSON",
        protocolVersion: "1.0"
      }
    ],
    provider: {
      organization: "iappstores",
      url: getAbsoluteUrl("/")
    },
    documentationUrl: getAbsoluteUrl("/api-docs"),
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extendedAgentCard: false
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "search-app-catalog",
        name: "Search iOS app catalog",
        description: "Search grouped iOS app listings by app name, bundle identifier, developer, repository source, and version metadata.",
        tags: ["ios", "ipa", "app-catalog", "search", "altstore", "sidestore"],
        examples: ["Search for Delta emulator", "Find IPA listings for a bundle identifier"]
      },
      {
        id: "browse-repositories",
        name: "Browse repository metadata",
        description: "List indexed repositories and browse their grouped app listings, categories, developers, and update metadata.",
        tags: ["repositories", "metadata", "ios", "ipa", "updates"],
        examples: ["List available repositories", "Show recently updated app listings"]
      },
      {
        id: "inspect-app-details",
        name: "Inspect app details",
        description: "Retrieve repository notes, version history, compatibility information, App Store context when available, and source download options for an app.",
        tags: ["app-details", "versions", "compatibility", "downloads"],
        examples: ["Get details for com.example.app", "Show download sources and versions for an app"]
      }
    ]
  };

  return Response.json(card, {
    headers: {
      "content-type": "application/a2a+json; charset=utf-8",
      "cache-control": "public, max-age=3600",
      etag: '"iappstores-agent-card-1.0.0"'
    }
  });
}
