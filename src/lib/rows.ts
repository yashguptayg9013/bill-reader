import type { Bill } from "./schema";

// One row per line item, with the bill header repeated on each row. This is
// the shape that works best in a spreadsheet (filter, pivot, SUMIF by supplier).

export const ROW_HEADERS = [
  "Invoice date",
  "Invoice no.",
  "Supplier",
  "Supplier GSTIN",
  "Item",
  "HSN/SAC",
  "Qty",
  "Unit",
  "Rate",
  "Taxable value",
  "GST %",
  "Bill CGST",
  "Bill SGST",
  "Bill IGST",
  "Bill total",
] as const;

export type Row = (string | number | null)[];

export function billToRows(bill: Bill): Row[] {
  const head = [bill.invoice_date, bill.invoice_number, bill.supplier.name, bill.supplier.gstin];
  const tail = [bill.totals.cgst, bill.totals.sgst, bill.totals.igst, bill.totals.grand_total];
  return bill.line_items.map((i) => [
    ...head,
    i.description,
    i.hsn_sac,
    i.quantity,
    i.unit,
    i.rate,
    i.taxable_value,
    i.gst_rate,
    ...tail,
  ]);
}

export function toCsv(bill: Bill): string {
  const esc = (v: string | number | null) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [ROW_HEADERS as readonly string[], ...billToRows(bill)].map((r) => r.map(esc).join(",")).join("\n");
}
