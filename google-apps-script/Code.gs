// Bill Reader → Google Sheets
//
// 1. Open the Google Sheet you want bills to land in.
// 2. Extensions → Apps Script. Paste this file over Code.gs.
// 3. Project Settings → Script properties → add SECRET = any long random string.
// 4. Deploy → New deployment → type "Web app". Execute as: Me. Who has access: Anyone.
// 5. Copy the web app URL into .env.local as GOOGLE_SHEETS_WEBHOOK_URL,
//    and the same secret as GOOGLE_SHEETS_SECRET.

const SHEET_NAME = "Purchases";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty("SECRET");
    if (!secret || body.secret !== secret) return json({ ok: false, error: "Bad secret" });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(body.headers.concat(["Added at"]));
      sheet.setFrozenRows(1);
    }

    const now = new Date();
    const rows = body.rows.map((r) => r.map((v) => (v === null ? "" : v)).concat([now]));
    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return json({ ok: true, appended: rows.length, sheetUrl: ss.getUrl() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
