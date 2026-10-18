import { BillSchema } from "@/lib/schema";
import { passcodeOk } from "@/lib/demo";
import { ROW_HEADERS, billToRows } from "@/lib/rows";

// Appends a bill to Google Sheets through a small Apps Script web app
// (see google-apps-script/Code.gs). No Google Cloud project or OAuth needed:
// the script runs as the sheet owner and checks a shared secret.

export async function POST(request: Request) {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) {
    return Response.json(
      { ok: false, error: "Google Sheets isn't connected. Set GOOGLE_SHEETS_WEBHOOK_URL in .env.local." },
      { status: 501 },
    );
  }

  if (!passcodeOk(request.headers.get("x-demo-passcode"))) {
    return Response.json({ ok: false, error: "Sending to Google Sheets needs the demo passcode." }, { status: 401 });
  }

  const parsed = BillSchema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ ok: false, error: "Invalid bill data." }, { status: 400 });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: process.env.GOOGLE_SHEETS_SECRET ?? "",
      headers: ROW_HEADERS,
      rows: billToRows(parsed.data),
    }),
    redirect: "follow",
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    return Response.json({ ok: false, error: body?.error ?? `Sheets returned ${res.status}` }, { status: 502 });
  }
  return Response.json({ ok: true, appended: body.appended, sheetUrl: body.sheetUrl ?? null });
}
