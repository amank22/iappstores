import { describe, expect, it, vi } from "vitest";
import { probeDownloadUrl } from "./downloadProbe.js";

function response(status: number): Response {
  return new Response(null, { status });
}

describe("downloadProbe", () => {
  it("classifies a successful HEAD probe as success", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(200));

    await expect(probeDownloadUrl("https://example.com/app.ipa", 100, fetcher)).resolves.toEqual({
      status: "success",
      statusCode: 200,
      error: null
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD" });
  });

  it("falls back to a ranged GET when HEAD is not enough", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(405)).mockResolvedValueOnce(response(206));

    await expect(probeDownloadUrl("https://example.com/app.ipa", 100, fetcher)).resolves.toEqual({
      status: "success",
      statusCode: 206,
      error: null
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: "GET",
      headers: {
        range: "bytes=0-0"
      }
    });
  });

  it("classifies confirmed missing links as hard failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(404)).mockResolvedValueOnce(response(404));

    await expect(probeDownloadUrl("https://example.com/missing.ipa", 100, fetcher)).resolves.toEqual({
      status: "hard_failure",
      statusCode: 404,
      error: "Download URL returned HTTP 404."
    });
  });

  it("classifies thrown probe errors as inconclusive", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("network blocked"));

    await expect(probeDownloadUrl("https://example.com/app.ipa", 100, fetcher)).resolves.toEqual({
      status: "inconclusive",
      statusCode: null,
      error: "network blocked"
    });
  });
});
