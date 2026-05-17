import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { normalizeAltStoreRepo } from "../src/normalizer.js";
import type { SourceDefinition } from "../src/sources.js";

const DEFAULT_INPUT = "../../repolist.txt";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 8;

type ValidationResult =
  | {
      status: "ok";
      url: string;
      finalUrl: string;
      name: string;
      subtitle: string | null;
      website: string | null;
      appCount: number;
      sampleApps: string[];
    }
  | {
      status: "failed";
      url: string;
      finalUrl?: string;
      reason: string;
    };

function getArgValue(name: string): string | undefined {
  const prefix = `${name}=`;
  const arg = process.argv.slice(2).find((value) => value === name || value.startsWith(prefix));
  if (!arg || arg === name) {
    return undefined;
  }

  return arg.slice(prefix.length);
}

function getInputPath(): string {
  return getArgValue("--input") ?? process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? DEFAULT_INPUT;
}

function getNumberArg(name: string, defaultValue: number): number {
  const value = getArgValue(name);
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : defaultValue;
}

function extractUrls(text: string): string[] {
  return Array.from(new Set(text.split(/\s+/).map((value) => value.trim()).filter(Boolean)));
}

function toTitle(value: string): string {
  return value
    .replace(/^www\./, "")
    .replace(/\.(json|php)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fallbackName(url: string): string {
  try {
    const parsed = new URL(url);
    const pathName = basename(parsed.pathname);
    return toTitle(pathName && pathName !== "/" ? pathName : parsed.hostname);
  } catch {
    return url;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asUrl(value: unknown): string | null {
  const text = asString(value);
  if (!text) {
    return null;
  }

  try {
    return new URL(text).toString();
  } catch {
    return null;
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<{ json: unknown; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "application/json, text/json;q=0.9, */*;q=0.5",
        "user-agent": "iappstores-source-validator/0.1"
      }
    });

    const finalUrl = response.url || url;
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    try {
      return {
        json: JSON.parse(text) as unknown,
        finalUrl
      };
    } catch {
      throw new Error(`Response is not valid JSON: ${text.trim().slice(0, 80) || "empty body"}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function validateUrl(url: string, timeoutMs: number): Promise<ValidationResult> {
  try {
    new URL(url);
  } catch {
    return {
      status: "failed",
      url,
      reason: "Invalid URL"
    };
  }

  try {
    const { json, finalUrl } = await fetchJson(url, timeoutMs);
    const repo = asRecord(json);
    const source: SourceDefinition = {
      id: "validator",
      name: asString(repo?.name) ?? fallbackName(finalUrl),
      subtitle: asString(repo?.subtitle ?? repo?.description),
      url: finalUrl,
      website: asUrl(repo?.website)
    };
    const apps = normalizeAltStoreRepo(json, source);

    if (apps.length === 0) {
      return {
        status: "failed",
        url,
        finalUrl,
        reason: "No compatible apps[] entries found"
      };
    }

    return {
      status: "ok",
      url,
      finalUrl,
      name: source.name,
      subtitle: source.subtitle,
      website: source.website,
      appCount: apps.length,
      sampleApps: apps.slice(0, 3).map((app) => app.name)
    };
  } catch (error) {
    return {
      status: "failed",
      url,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function printSummary(results: ValidationResult[]): void {
  const working = results.filter((result): result is Extract<ValidationResult, { status: "ok" }> => result.status === "ok");
  const failed = results.filter((result): result is Extract<ValidationResult, { status: "failed" }> => result.status === "failed");

  console.log(`Checked ${results.length} unique URLs.`);
  console.log(`Working: ${working.length}`);
  console.log(`Failed: ${failed.length}`);

  if (working.length > 0) {
    console.log("\nWorking sources:");
    for (const source of working) {
      console.log(`- ${source.name} (${source.appCount} apps)`);
      console.log(`  ${source.finalUrl}`);
      console.log(`  samples: ${source.sampleApps.join(", ")}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nFailed sources:");
    for (const source of failed) {
      console.log(`- ${source.url}`);
      console.log(`  ${source.reason}`);
    }
  }
}

async function main(): Promise<void> {
  const input = getInputPath();
  const timeoutMs = getNumberArg("--timeout-ms", DEFAULT_TIMEOUT_MS);
  const concurrency = getNumberArg("--concurrency", DEFAULT_CONCURRENCY);
  const urls = extractUrls(await readFile(input, "utf8"));

  console.log(`Validating ${urls.length} unique URLs from ${input}...\n`);

  const results = await mapWithConcurrency(urls, concurrency, async (url, index) => {
    const result = await validateUrl(url, timeoutMs);
    const label = result.status === "ok" ? `${result.appCount} apps` : result.reason;
    console.log(`[${index + 1}/${urls.length}] ${result.status.toUpperCase()} ${url} - ${label}`);
    return result;
  });

  console.log("");
  printSummary(results);
}

await main();
