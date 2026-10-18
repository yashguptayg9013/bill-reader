// Runs every sample bill through a running app and scores the extraction
// against the known values in scripts/expected.
//
//   npm run dev          (in another terminal)
//   npm run eval
//
// Each run calls the Claude API once per sample bill.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SAMPLES = path.join(here, "..", "public", "samples");
const EXPECTED = path.join(here, "expected");

const norm = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.01);

function score(exp, bill) {
  const fields = [
    ["supplier name", norm(exp.supplier_name) === norm(bill.supplier.name)],
    ["supplier GSTIN", norm(exp.supplier_gstin) === norm(bill.supplier.gstin)],
    ["invoice no.", norm(exp.invoice_number) === norm(bill.invoice_number)],
    ["invoice date", exp.invoice_date === bill.invoice_date],
    ["line count", exp.line_items.length === bill.line_items.length],
    ["taxable value", num(exp.taxable_value, bill.totals.taxable_value)],
    ["CGST", num(exp.cgst, bill.totals.cgst)],
    ["SGST", num(exp.sgst, bill.totals.sgst)],
    ["IGST", num(exp.igst, bill.totals.igst)],
    ["grand total", num(exp.grand_total, bill.totals.grand_total)],
  ];
  exp.line_items.forEach((e, i) => {
    const got = bill.line_items[i] ?? {};
    fields.push([`line ${i + 1} qty`, num(e.quantity, got.quantity)]);
    fields.push([`line ${i + 1} rate`, num(e.rate, got.rate)]);
    fields.push([`line ${i + 1} GST %`, num(e.gst_rate, got.gst_rate)]);
  });
  return fields;
}

let total = 0;
let correct = 0;
for (const file of (await fs.readdir(SAMPLES)).sort()) {
  const name = file.replace(/\.\w+$/, "");
  const exp = JSON.parse(await fs.readFile(path.join(EXPECTED, `${name}.json`), "utf8"));
  const type = file.endsWith(".png") ? "image/png" : "image/jpeg";
  const form = new FormData();
  form.append("file", new Blob([await fs.readFile(path.join(SAMPLES, file))], { type }), file);

  const res = await fetch(`${BASE}/api/extract`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) {
    console.log(`✗ ${name}: ${data.error}`);
    continue;
  }
  const fields = score(exp, data.bill);
  const ok = fields.filter(([, pass]) => pass).length;
  total += fields.length;
  correct += ok;
  console.log(`${ok === fields.length ? "✓" : "•"} ${name}: ${ok}/${fields.length} fields in ${data.seconds}s`);
  for (const [label, pass] of fields) if (!pass) console.log(`    missed: ${label}`);
}
if (total) console.log(`\nOverall: ${correct}/${total} fields (${((100 * correct) / total).toFixed(1)}%)`);
