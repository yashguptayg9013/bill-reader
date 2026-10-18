"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bill, ExtractResponse, LineItem } from "@/lib/schema";
import { runChecks } from "@/lib/checks";
import { toCsv } from "@/lib/rows";
import { prepareForUpload } from "@/lib/image";
import { SAMPLES } from "@/lib/samples";

type Status =
  | { kind: "idle" }
  | { kind: "reading"; startedAt: number }
  | { kind: "done"; seconds: number; model: string }
  | { kind: "error"; message: string };

type Config = { passcodeRequired: boolean; sheetsConfigured: boolean };

// Event-time clock, kept outside components so it never runs during render.
const clock = () => Date.now();

export default function BillReader() {
  const [preview, setPreview] = useState<{ url: string; isPdf: boolean; name: string } | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [bill, setBill] = useState<Bill | null>(null);
  const [activeSample, setActiveSample] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [passcode, setPasscode] = useState("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig({ passcodeRequired: false, sheetsConfigured: false }));
  }, []);

  async function read(file: File, sampleId: string | null = null) {
    setActiveSample(sampleId);
    setBill(null);
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ url: URL.createObjectURL(file), isPdf: file.type === "application/pdf", name: file.name });
    setStatus({ kind: "reading", startedAt: clock() });

    try {
      const upload = await prepareForUpload(file);
      const form = new FormData();
      form.append("file", upload);
      if (passcode) form.append("passcode", passcode);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      const data = (await res.json()) as ExtractResponse;
      if (!data.ok) throw new Error(data.error);
      setBill(data.bill);
      setStatus({ kind: "done", seconds: data.seconds, model: data.model });
      // On phones the result sits below the photo; bring it into view.
      if (window.innerWidth < 1280) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Something went wrong." });
    }
  }

  async function readSample(sample: (typeof SAMPLES)[number]) {
    const blob = await fetch(sample.src).then((r) => r.blob());
    const name = sample.src.split("/").pop()!;
    await read(new File([blob], name, { type: blob.type }), sample.id);
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (f) read(f);
  }

  const busy = status.kind === "reading";
  // On the public demo, your own bills need the passcode; samples never do.
  const uploadsLocked = Boolean(config?.passcodeRequired) && !passcode;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-8 flex flex-col gap-2 sm:mb-10">
        <p className="text-sm font-medium tracking-wide text-accent">Bill Reader</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Photograph a supplier bill. Get a clean purchase entry.
        </h1>
        <p className="max-w-2xl text-muted text-pretty">
          Claude reads the supplier, items, quantities, GST and total, then checks the maths. Fix anything it flags,
          then export to Google Sheets or BillKhata.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-8">
        {/* Left: input */}
        <section className="flex flex-col gap-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!uploadsLocked) onFiles(e.dataTransfer.files);
            }}
            className={`relative flex min-h-72 flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
              dragging ? "border-accent bg-accent-soft" : "border-line bg-surface"
            }`}
          >
            {preview ? (
              preview.isPdf ? (
                <iframe src={preview.url} title={preview.name} className="h-[28rem] w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.url} alt="Uploaded bill" className="max-h-[32rem] w-full object-contain" />
              )
            ) : (
              <div className="flex flex-col items-center gap-3 p-8 text-center">
                <svg
                  viewBox="0 0 24 24"
                  className="size-10 text-muted"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M7 3h7l5 5v13H7z" />
                  <path d="M14 3v5h5M10 13h6M10 17h6" />
                </svg>
                <p className="font-medium">Drop a bill here</p>
                <p className="text-sm text-muted">JPG, PNG or PDF, up to 4 MB</p>
              </div>
            )}
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/70 backdrop-blur-[2px]">
                <ReadingTimer startedAt={status.startedAt} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy || uploadsLocked}
              onClick={() => cameraInput.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
            >
              Take photo
            </button>
            <button
              type="button"
              disabled={busy || uploadsLocked}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-2 disabled:opacity-50"
            >
              Upload file
            </button>
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => {
                onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {config?.passcodeRequired && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">
                This is a public demo. Enter the passcode to read your own bill, or try a sample below.
              </span>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Demo passcode"
                autoComplete="off"
                className="max-w-xs rounded-md border border-line bg-surface px-2.5 py-1.5 outline-none focus:border-accent"
              />
            </label>
          )}

          <div>
            <h2 className="mb-3 text-sm font-medium text-muted">Or try a sample bill</h2>
            <div className="grid grid-cols-3 gap-3">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => readSample(s)}
                  className={`group flex flex-col overflow-hidden rounded-lg border text-left transition disabled:opacity-50 ${
                    activeSample === s.id ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-muted"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt="" className="aspect-[3/4] w-full bg-surface-2 object-cover object-top" />
                  <span className="flex flex-col gap-0.5 p-2">
                    <span className="text-xs font-medium leading-tight sm:text-sm">{s.title}</span>
                    <span className="hidden text-xs leading-tight text-muted sm:block">{s.note}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Right: result */}
        <section ref={resultRef} className="min-w-0 scroll-mt-4">
          {status.kind === "error" && (
            <div className="rounded-xl border border-bad/40 bg-bad-soft p-4 text-sm">
              <p className="font-medium text-bad">Couldn&apos;t read that bill</p>
              <p className="mt-1">{status.message}</p>
            </div>
          )}
          {status.kind === "idle" && <EmptyResult />}
          {status.kind === "reading" && <ResultSkeleton />}
          {bill && status.kind === "done" && (
            <Result
              bill={bill}
              setBill={setBill}
              seconds={status.seconds}
              model={status.model}
              config={config}
              passcode={passcode}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function ReadingTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-sm">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
      Reading bill… <span className="tabular-nums text-muted">{((now - startedAt) / 1000).toFixed(1)}s</span>
    </div>
  );
}

function EmptyResult() {
  return (
    <div className="flex h-full min-h-72 flex-col justify-center rounded-xl border border-line bg-surface p-6 sm:p-8">
      <p className="font-medium">What you get back</p>
      <ul className="mt-3 space-y-2 text-sm text-muted">
        <li>Supplier name, GSTIN, invoice number and date</li>
        <li>Every line item with HSN, quantity, rate and GST rate</li>
        <li>CGST, SGST or IGST, round-off and grand total</li>
        <li>Automatic checks: qty × rate, line totals, GST maths, GSTIN format</li>
        <li>One click to CSV, Google Sheets or a BillKhata-ready JSON</li>
      </ul>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-6" aria-busy="true">
      {[40, 70, 55, 90, 90, 90, 60].map((w, i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

function Result({
  bill,
  setBill,
  seconds,
  model,
  config,
  passcode,
}: {
  bill: Bill;
  setBill: (b: Bill) => void;
  seconds: number;
  model: string;
  config: Config | null;
  passcode: string;
}) {
  const checks = useMemo(() => runChecks(bill), [bill]);
  const failing = checks.filter((c) => !c.ok).length;

  const setField = <K extends keyof Bill>(key: K, value: Bill[K]) => setBill({ ...bill, [key]: value });
  const setSupplier = (key: keyof Bill["supplier"], value: string) =>
    setBill({ ...bill, supplier: { ...bill.supplier, [key]: value || null } });
  const setTotal = (key: keyof Bill["totals"], value: number | null) =>
    setBill({ ...bill, totals: { ...bill.totals, [key]: value } });
  const setItem = (idx: number, patch: Partial<LineItem>) =>
    setBill({ ...bill, line_items: bill.line_items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  const isIgst = bill.totals.igst != null && bill.totals.igst !== 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 rounded-full bg-good-soft px-3 py-1 font-medium text-good">
          Read in {seconds.toFixed(1)}s
        </span>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium ${
            failing ? "bg-warn-soft text-warn" : "bg-good-soft text-good"
          }`}
        >
          {failing ? `${failing} check${failing > 1 ? "s" : ""} to review` : `All ${checks.length} checks pass`}
        </span>
        <span className="text-muted">{model}</span>
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2">
        <Field label="Supplier" value={bill.supplier.name} onChange={(v) => setSupplier("name", v)} wide />
        <Field label="Supplier GSTIN" value={bill.supplier.gstin} onChange={(v) => setSupplier("gstin", v)} mono />
        <Field label="Supplier state" value={bill.supplier.state} onChange={(v) => setSupplier("state", v)} />
        <Field
          label="Invoice no."
          value={bill.invoice_number}
          onChange={(v) => setField("invoice_number", v || null)}
          mono
        />
        <Field
          label="Invoice date"
          value={bill.invoice_date}
          onChange={(v) => setField("invoice_date", v || null)}
          type="date"
        />
      </div>

      {/* Line items */}
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 font-medium">HSN</th>
                <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th className="px-3 py-2.5 text-right font-medium">Rate</th>
                <th className="px-3 py-2.5 text-right font-medium">Taxable</th>
                <th className="px-3 py-2.5 text-right font-medium">GST %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bill.line_items.map((it, i) => (
                <tr key={i}>
                  <td className="px-1 py-1">
                    <Cell value={it.description} onChange={(v) => setItem(i, { description: v })} />
                    {it.unit && <span className="px-2 text-xs text-muted">{it.unit}</span>}
                  </td>
                  <td className="w-24 px-1 py-1">
                    <Cell value={it.hsn_sac ?? ""} onChange={(v) => setItem(i, { hsn_sac: v || null })} mono />
                  </td>
                  <td className="w-20 px-1 py-1">
                    <NumCell value={it.quantity} onChange={(v) => setItem(i, { quantity: v })} />
                  </td>
                  <td className="w-28 px-1 py-1">
                    <NumCell value={it.rate} onChange={(v) => setItem(i, { rate: v })} />
                  </td>
                  <td className="w-32 px-1 py-1">
                    <NumCell value={it.taxable_value} onChange={(v) => setItem(i, { taxable_value: v })} />
                  </td>
                  <td className="w-20 px-1 py-1">
                    <NumCell value={it.gst_rate} onChange={(v) => setItem(i, { gst_rate: v })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-line bg-surface-2/50">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 px-5 py-4 text-sm sm:ml-auto sm:max-w-sm">
            <TotalRow
              label="Taxable value"
              value={bill.totals.taxable_value}
              onChange={(v) => setTotal("taxable_value", v)}
            />
            {isIgst ? (
              <TotalRow label="IGST" value={bill.totals.igst} onChange={(v) => setTotal("igst", v)} />
            ) : (
              <>
                <TotalRow label="CGST" value={bill.totals.cgst} onChange={(v) => setTotal("cgst", v)} />
                <TotalRow label="SGST" value={bill.totals.sgst} onChange={(v) => setTotal("sgst", v)} />
              </>
            )}
            {bill.totals.other_charges != null && (
              <TotalRow
                label="Other charges"
                value={bill.totals.other_charges}
                onChange={(v) => setTotal("other_charges", v)}
              />
            )}
            {bill.totals.round_off != null && (
              <TotalRow label="Round off" value={bill.totals.round_off} onChange={(v) => setTotal("round_off", v)} />
            )}
            <div className="col-span-2 mt-1 grid grid-cols-2 gap-x-6 border-t border-line pt-2 font-semibold">
              <dt className="py-1">Grand total ₹</dt>
              <dd className="-my-0.5">
                <NumCell value={bill.totals.grand_total} onChange={(v) => setTotal("grand_total", v)} />
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Checks + notes */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="mb-3 text-sm font-medium">Checks</h3>
          <ul className="space-y-2.5 text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex gap-2.5">
                <span
                  className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    c.ok ? "bg-good text-on-accent" : "bg-warn text-on-accent"
                  }`}
                  aria-label={c.ok ? "pass" : "review"}
                >
                  {c.ok ? "✓" : "!"}
                </span>
                <span className="min-w-0">
                  <span className="block">{c.label}</span>
                  <span className="block break-words text-xs text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-line bg-surface p-5">
          <h3 className="mb-3 text-sm font-medium">Reader notes</h3>
          {bill.reader_notes.length ? (
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted">
              {bill.reader_notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing unclear on this bill.</p>
          )}
        </div>
      </div>

      <Exports bill={bill} config={config} passcode={passcode} />
    </div>
  );
}

function Exports({ bill, config, passcode }: { bill: Bill; config: Config | null; passcode: string }) {
  const [sheetStatus, setSheetStatus] = useState<string | null>(null);
  const sheetsReady = Boolean(config?.sheetsConfigured) && !(config?.passcodeRequired && !passcode);

  const base = `${bill.supplier.name ?? "bill"}-${bill.invoice_number ?? ""}`.replace(/[^\w-]+/g, "_");

  function download(content: string, name: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sendToSheets() {
    setSheetStatus("Sending…");
    const res = await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-demo-passcode": passcode },
      body: JSON.stringify(bill),
    });
    const data = await res.json();
    setSheetStatus(
      data.ok ? `Added ${data.appended} row${data.appended === 1 ? "" : "s"} to Google Sheets` : data.error,
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={sendToSheets}
          disabled={!sheetsReady}
          title={
            !config?.sheetsConfigured
              ? "Set GOOGLE_SHEETS_WEBHOOK_URL to enable"
              : sheetsReady
                ? undefined
                : "Needs the demo passcode"
          }
          className="rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send to Google Sheets
        </button>
        <button
          type="button"
          onClick={() => download("\uFEFF" + toCsv(bill), `${base}.csv`, "text/csv")}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={() => download(JSON.stringify(bill, null, 2), `${base}.billkhata.json`, "application/json")}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
        >
          JSON for BillKhata
        </button>
      </div>
      {sheetStatus && <p className="text-sm text-muted">{sheetStatus}</p>}
      {config && !config.sheetsConfigured && !config.passcodeRequired && (
        <p className="text-xs text-muted">
          Google Sheets isn&apos;t connected yet. See the README to set up the Apps Script in about 2 minutes.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  mono,
  wide,
  type = "text",
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  mono?: boolean;
  wide?: boolean;
  type?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value ?? ""}
        placeholder="Not found"
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-md border border-line bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted/60 focus:border-accent ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}

function Cell({ value, onChange, mono }: { value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded px-2 py-1.5 outline-none hover:bg-surface-2 focus:bg-surface-2 focus:ring-1 focus:ring-accent ${
        mono ? "font-mono text-xs" : ""
      }`}
    />
  );
}

function NumCell({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  // Keep the typed text locally so "12." or "0.0" survive while typing.
  const [text, setText] = useState(value == null ? "" : String(value));
  const parse = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));
  if (parse(text) !== value && !(Number.isNaN(parse(text)) && value == null)) {
    setText(value == null ? "" : String(value));
  }
  return (
    <input
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (n == null || !Number.isNaN(n)) onChange(n);
      }}
      className="w-full rounded px-2 py-1.5 text-right tabular-nums outline-none hover:bg-surface-2 focus:bg-surface-2 focus:ring-1 focus:ring-accent"
    />
  );
}

function TotalRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <>
      <dt className="py-1 text-muted">{label}</dt>
      <dd className="-my-0.5">
        <NumCell value={value} onChange={onChange} />
      </dd>
    </>
  );
}
