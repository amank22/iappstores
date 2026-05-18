import { translate } from "@vitalets/google-translate-api";
import type { TranslationRequest, TranslationResponse } from "@iappstores/contracts";

type AnyRecord = Record<string, unknown>;

function asRecord(value: unknown): AnyRecord | null {
  return typeof value === "object" && value !== null ? (value as AnyRecord) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getDetectedLanguage(raw: unknown): string | null {
  const rawRecord = asRecord(raw);
  const directSource = asString(rawRecord?.src);
  if (directSource) {
    return directSource;
  }

  const languageDetection = asRecord(rawRecord?.ld_result);
  const sourceLanguages = languageDetection?.srclangs;
  if (Array.isArray(sourceLanguages)) {
    return asString(sourceLanguages[0]);
  }

  return null;
}

export async function translateText(request: TranslationRequest): Promise<TranslationResponse> {
  const result = await translate(request.text, {
    from: request.from,
    to: request.to
  });

  return {
    sourceText: request.text,
    translatedText: result.text,
    from: getDetectedLanguage(result.raw),
    to: request.to
  };
}
