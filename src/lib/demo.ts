import { createHash, timingSafeEqual } from "node:crypto";
import sampleHashes from "./sample-hashes.json";
import type { ExtractResponse } from "./schema";

// Public demo protection. When DEMO_PASSCODE is set (e.g. on the deployed
// site), anyone can run the bundled sample bills, but uploading their own bill
// or sending to Google Sheets needs the passcode. Unset locally = no limits.

const SAMPLES = new Set<string>(sampleHashes);
const sampleCache = new Map<string, ExtractResponse>();

export const passcodeRequired = () => Boolean(process.env.DEMO_PASSCODE);

export function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

export function isSample(hash: string) {
  return SAMPLES.has(hash);
}

export function passcodeOk(given: string | null) {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return true;
  if (!given) return false;
  // Compare digests so the comparison takes the same time whatever the input.
  return timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(expected).digest());
}

// Sample results are cached per server instance, so repeat clicks on the demo
// don't spend API credits.
export function cachedSample(hash: string) {
  return sampleCache.get(hash);
}

export function cacheSample(hash: string, result: ExtractResponse) {
  if (result.ok && isSample(hash)) sampleCache.set(hash, result);
}
