import type { Bill } from "./schema";

// Arithmetic cross-checks on an extracted bill. The model reads; these catch
// misreads (and mistakes on the bill itself) before anything is saved.

export type Check = { label: string; ok: boolean; detail: string };

const TOLERANCE = 1; // rupees; bills round per line

const inr = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const close = (a: number, b: number, tol = TOLERANCE) => Math.abs(a - b) <= tol;
const sum = (xs: (number | null)[]) => xs.reduce<number>((acc, x) => acc + (x ?? 0), 0);

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function lineTaxable(item: Bill["line_items"][number]): number | null {
  if (item.taxable_value != null) return item.taxable_value;
  if (item.quantity != null && item.rate != null) return item.quantity * item.rate - (item.discount ?? 0);
  return item.amount;
}

export function runChecks(bill: Bill): Check[] {
  const checks: Check[] = [];
  const t = bill.totals;

  const badLines = bill.line_items.filter(
    (i) =>
      i.quantity != null &&
      i.rate != null &&
      i.taxable_value != null &&
      !close(i.quantity * i.rate - (i.discount ?? 0), i.taxable_value),
  );
  if (bill.line_items.some((i) => i.quantity != null && i.rate != null && i.taxable_value != null)) {
    checks.push({
      label: "Qty × rate = line value",
      ok: badLines.length === 0,
      detail: badLines.length === 0 ? "Every line matches" : `Check: ${badLines.map((i) => i.description).join(", ")}`,
    });
  }

  const linesTotal = sum(bill.line_items.map(lineTaxable));
  if (t.taxable_value != null && bill.line_items.length > 0) {
    checks.push({
      label: "Lines add up to taxable total",
      ok: close(linesTotal, t.taxable_value, TOLERANCE * bill.line_items.length),
      detail: `Lines ₹${inr(linesTotal)} vs bill ₹${inr(t.taxable_value)}`,
    });
  }

  const taxable = t.taxable_value ?? linesTotal;
  const expectedTax = sum(bill.line_items.map((i) => ((lineTaxable(i) ?? 0) * (i.gst_rate ?? 0)) / 100));
  const printedTax = sum([t.cgst, t.sgst, t.igst]);
  if (printedTax > 0 && bill.line_items.some((i) => i.gst_rate != null)) {
    checks.push({
      label: "GST matches the rates",
      ok: close(expectedTax, printedTax, Math.max(TOLERANCE, bill.line_items.length * 0.5)),
      detail: `Expected ₹${inr(expectedTax)} vs bill ₹${inr(printedTax)}`,
    });
  }

  if (t.cgst != null && t.sgst != null) {
    checks.push({
      label: "CGST = SGST",
      ok: close(t.cgst, t.sgst),
      detail: `₹${inr(t.cgst)} / ₹${inr(t.sgst)}`,
    });
  }

  if (t.grand_total != null) {
    const computed = taxable + printedTax + (t.cess ?? 0) + (t.other_charges ?? 0) + (t.round_off ?? 0);
    checks.push({
      label: "Grand total adds up",
      ok: close(computed, t.grand_total),
      detail: `Computed ₹${inr(computed)} vs bill ₹${inr(t.grand_total)}`,
    });
  }

  if (bill.supplier.gstin) {
    const g = bill.supplier.gstin.replace(/\s/g, "").toUpperCase();
    checks.push({
      label: "Supplier GSTIN format",
      ok: GSTIN.test(g),
      detail: GSTIN.test(g) ? g : `${g} doesn't look like a valid GSTIN`,
    });
  }

  return checks;
}
