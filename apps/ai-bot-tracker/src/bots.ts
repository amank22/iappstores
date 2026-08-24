export type BotCategory = "crawler" | "trainer" | "assistant" | "search";

export interface KnownBot {
  name: string;
  category: BotCategory;
  pattern: RegExp;
}

/**
 * Curated User-Agent signatures for AI crawlers/agents. Not exhaustive —
 * extend as new agents show up in Cloudflare logs or GA4 "(not set)" bot hits.
 */
export const KNOWN_AI_BOTS: KnownBot[] = [
  { name: "GPTBot", category: "trainer", pattern: /GPTBot/i },
  { name: "ChatGPT-User", category: "assistant", pattern: /ChatGPT-User/i },
  { name: "OAI-SearchBot", category: "search", pattern: /OAI-SearchBot/i },
  { name: "ClaudeBot", category: "trainer", pattern: /ClaudeBot/i },
  { name: "Claude-User", category: "assistant", pattern: /Claude-User/i },
  { name: "Claude-SearchBot", category: "search", pattern: /Claude-SearchBot/i },
  { name: "Google-Extended", category: "trainer", pattern: /Google-Extended/i },
  { name: "GoogleOther", category: "crawler", pattern: /GoogleOther/i },
  { name: "PerplexityBot", category: "search", pattern: /PerplexityBot/i },
  { name: "Perplexity-User", category: "assistant", pattern: /Perplexity-User/i },
  { name: "Applebot-Extended", category: "trainer", pattern: /Applebot-Extended/i },
  { name: "Bytespider", category: "trainer", pattern: /Bytespider/i },
  { name: "CCBot", category: "trainer", pattern: /CCBot/i },
  { name: "Amazonbot", category: "crawler", pattern: /Amazonbot/i },
  { name: "Meta-ExternalAgent", category: "trainer", pattern: /Meta-ExternalAgent/i },
  { name: "meta-externalfetcher", category: "assistant", pattern: /meta-externalfetcher/i },
  { name: "cohere-ai", category: "trainer", pattern: /cohere-ai|Cohere-Training-Data-Crawler/i },
  { name: "Diffbot", category: "crawler", pattern: /Diffbot/i },
  { name: "YouBot", category: "search", pattern: /YouBot/i },
  { name: "Timpibot", category: "trainer", pattern: /Timpibot/i },
  { name: "omgilibot", category: "trainer", pattern: /omgili|omgilibot/i },
  { name: "DuckAssistBot", category: "assistant", pattern: /DuckAssistBot/i },
  { name: "PetalBot", category: "crawler", pattern: /PetalBot/i },
  { name: "ImagesiftBot", category: "crawler", pattern: /ImagesiftBot/i },
];

export function matchBot(userAgent: string): KnownBot | null {
  for (const bot of KNOWN_AI_BOTS) {
    if (bot.pattern.test(userAgent)) return bot;
  }
  return null;
}
