import { z } from "zod";

// The shape Claude fills in for every bill. Kept flat and explicit so it maps
// cleanly onto spreadsheet rows and onto BillKhata's purchase entry.
// Unknown values are null rather than guessed.

export const LineItemSchema = z.object({
  description: z.string().describe("Item name exactly as printed"),
  hsn_sac: z.string().nullable().describe("HSN or SAC code, if printed"),
  quantity: z.number().nullable(),
  unit: z.string().nullable().describe("e.g. PCS, NOS, KG, BOX, MTR"),
  rate: z.number().nullable().describe("Price per unit before tax"),
  discount: z.number().nullable().describe("Discount amount on this line, if any"),
  taxable_value: z.number().nullable().describe("Line value before GST"),
  gst_rate: z.number().nullable().describe("Total GST percent for the line, e.g. 18"),
  amount: z.number().nullable().describe("Line total as printed (usually before tax on GST invoices)"),
});

export const BillSchema = z.object({
  document_type: z
    .enum(["tax_invoice", "bill_of_supply", "estimate_or_kachha_bill", "credit_note", "other"])
    .describe("What kind of document this is"),
  supplier: z.object({
    name: z.string().nullable(),
    gstin: z.string().nullable().describe("15-character GSTIN of the seller"),
    address: z.string().nullable(),
    state: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  buyer: z.object({
    name: z.string().nullable(),
    gstin: z.string().nullable(),
  }),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable().describe("ISO format YYYY-MM-DD"),
  place_of_supply: z.string().nullable(),
  currency: z.string().describe("ISO code, INR unless the bill says otherwise"),
  line_items: z.array(LineItemSchema),
  totals: z.object({
    taxable_value: z.number().nullable().describe("Sum of taxable values before GST"),
    cgst: z.number().nullable(),
    sgst: z.number().nullable(),
    igst: z.number().nullable(),
    cess: z.number().nullable(),
    other_charges: z.number().nullable().describe("Freight, packing etc. if shown separately"),
    round_off: z.number().nullable().describe("Negative if rounded down"),
    grand_total: z.number().nullable().describe("Final payable amount"),
  }),
  amount_in_words: z.string().nullable(),
  reader_notes: z
    .array(z.string())
    .describe("Short notes on anything unclear, smudged, handwritten or assumed. Empty if none."),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type Bill = z.infer<typeof BillSchema>;

export type ExtractResponse = { ok: true; bill: Bill; seconds: number; model: string } | { ok: false; error: string };
