import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { BillSchema, type Bill } from "./schema";

const MODEL = process.env.BILL_READER_MODEL ?? "claude-opus-5-5";
// Reading a bill is mostly perception, so low effort keeps it fast.
// Raise to "medium" or "high" if you see misreads on messy handwritten bills.
const EFFORT = (process.env.BILL_READER_EFFORT ?? "low") as "low" | "medium" | "high";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

export const SUPPORTED_TYPES: string[] = [...IMAGE_TYPES, "application/pdf"];

const SYSTEM = `You read Indian supplier invoices and bills for a small import and trading business.
Extract what is printed or written on the document into the given schema.

Rules:
- Copy values as printed. Do not invent a GSTIN, invoice number or HSN code. Use null when a field is absent or unreadable.
- Numbers are plain numbers: no currency symbols, no commas. Indian digit grouping (1,23,456.00) means 123456.
- Dates go to YYYY-MM-DD. Indian bills use DD/MM/YYYY or DD-MM-YY.
- Intra-state invoices split GST into CGST and SGST; inter-state invoices use IGST. Fill whichever the bill shows and leave the others null.
- gst_rate on a line is the total rate (CGST 9% + SGST 9% is 18).
- If the document is a photo that is tilted, creased or partly handwritten, still read it, and add a short reader_note for anything you were unsure about.
- If something does not add up on the bill itself, copy the printed numbers anyway and mention it in reader_notes.`;

let client: Anthropic | undefined;

export class ExtractError extends Error {}

export async function extractBill(data: Buffer, mediaType: string): Promise<{ bill: Bill; model: string }> {
  const base64 = data.toString("base64");

  const source: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mediaType as ImageType, data: base64 } };

  client ??= new Anthropic();
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, the API retries on Anthropic's
    // recommended fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: EFFORT, format: betaZodOutputFormat(BillSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [source, { type: "text", text: "Extract this bill." }],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new ExtractError("The model declined to read this document.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ExtractError("The bill was too long to read in one go. Try splitting it into pages.");
  }
  if (!response.parsed_output) {
    throw new ExtractError("Could not read a structured result from this document.");
  }
  return { bill: response.parsed_output, model: response.model };
}
