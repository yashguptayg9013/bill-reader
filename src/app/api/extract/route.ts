import Anthropic from "@anthropic-ai/sdk";
import { ExtractError, SUPPORTED_TYPES, extractBill } from "@/lib/extract";
import { cacheSample, cachedSample, isSample, passcodeOk, sha256 } from "@/lib/demo";
import type { ExtractResponse } from "@/lib/schema";

export const maxDuration = 60;

// Vercel caps request bodies at 4.5 MB. Photos are shrunk in the browser first.
const MAX_BYTES = 4 * 1024 * 1024;

function fail(error: string, status: number) {
  return Response.json({ ok: false, error } satisfies ExtractResponse, { status });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");

  if (!(file instanceof File)) return fail("No file uploaded.", 400);
  if (!SUPPORTED_TYPES.includes(file.type)) {
    return fail(`Unsupported file type ${file.type || "(unknown)"}. Use JPG, PNG, WEBP or PDF.`, 415);
  }
  if (file.size > MAX_BYTES) return fail("File is larger than 4 MB.", 413);

  const data = Buffer.from(await file.arrayBuffer());
  const hash = sha256(data);
  const passcode = form.get("passcode");
  if (!isSample(hash) && !passcodeOk(typeof passcode === "string" ? passcode : null)) {
    return fail(
      "This demo needs a passcode to read your own bills. Try one of the sample bills, or enter the passcode.",
      401,
    );
  }

  const cached = cachedSample(hash);
  if (cached) return Response.json(cached);

  const started = performance.now();
  try {
    const { bill, model } = await extractBill(data, file.type);
    const seconds = Math.round((performance.now() - started) / 100) / 10;
    const result = { ok: true, bill, seconds, model } satisfies ExtractResponse;
    cacheSample(hash, result);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ExtractError) return fail(error.message, 422);
    if (error instanceof Anthropic.AuthenticationError) {
      return fail("ANTHROPIC_API_KEY is missing or invalid. Add it to .env.local and restart.", 500);
    }
    if (error instanceof Anthropic.RateLimitError) return fail("Rate limited. Try again in a moment.", 429);
    if (error instanceof Anthropic.BadRequestError) return fail(`Request rejected: ${error.message}`, 400);
    if (error instanceof Anthropic.APIError) return fail(`Claude API error ${error.status}.`, 502);
    if (error instanceof Error && /api key|apiKey|authToken/i.test(error.message)) {
      return fail("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart.", 500);
    }
    console.error(error);
    return fail("Something went wrong reading this bill.", 500);
  }
}
