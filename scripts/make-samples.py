"""Generate the demo bills in public/samples and their expected values.

All businesses, GSTINs and figures are fictional. Renders HTML with headless
Chrome, so run on a machine with Google Chrome installed:

    python3 scripts/make-samples.py
"""

import hashlib
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "samples"
EXPECTED = ROOT / "scripts" / "expected"
HASHES = ROOT / "src" / "lib" / "sample-hashes.json"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def r2(x):
    return round(x + 1e-9, 2)


def inr(x):
    """Indian digit grouping: 123456.5 -> 1,23,456.50"""
    s = f"{x:.2f}"
    whole, frac = s.split(".")
    neg = whole.startswith("-")
    whole = whole.lstrip("-")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        whole = ",".join(groups + [tail])
    return ("-" if neg else "") + whole + "." + frac


BILLS = {
    "intra-state-invoice": {
        "supplier": {
            "name": "Shree Ganesh Electronics Traders",
            "gstin": "27AAKFS4821M1Z5",
            "address": "Shop 14, Lamington Road, Grant Road (E), Mumbai 400007",
            "state": "Maharashtra",
            "phone": "+91 98200 41736",
        },
        "buyer": {"name": "Kaveri Imports & Trading", "gstin": "27AAPCK7731R1ZQ",
                  "address": "Unit 3, Bhiwandi Logistics Park, Thane 421302"},
        "invoice_number": "SGE/26-27/1187",
        "invoice_date": "2026-09-12",
        "place_of_supply": "27-Maharashtra",
        "mode": "intra",
        "items": [
            ("USB-C Fast Charger 20W", "8504", 50, "PCS", 245.00, 18),
            ("Braided USB-C Cable 1m", "8544", 120, "PCS", 68.50, 18),
            ("TWS Earbuds Model X2", "8518", 30, "PCS", 610.00, 18),
            ("Power Bank 10000mAh", "8507", 25, "PCS", 720.00, 18),
            ("Aluminium Phone Stand", "7616", 40, "PCS", 95.00, 18),
            ("Tempered Glass Screen Guard", "7007", 200, "PCS", 18.00, 18),
        ],
    },
    "inter-state-invoice": {
        "supplier": {
            "name": "Northline Home Goods Pvt. Ltd.",
            "gstin": "07AAECN5512K1ZX",
            "address": "B-42, Okhla Industrial Area Phase II, New Delhi 110020",
            "state": "Delhi",
            "phone": "011-4105 7720",
        },
        "buyer": {"name": "Kaveri Imports & Trading", "gstin": "27AAPCK7731R1ZQ",
                  "address": "Unit 3, Bhiwandi Logistics Park, Thane 421302"},
        "invoice_number": "NHG-2026-04412",
        "invoice_date": "2026-10-03",
        "place_of_supply": "27-Maharashtra",
        "mode": "inter",
        "items": [
            ("Stainless Steel Water Bottle 1L", "7323", 60, "NOS", 185.00, 18),
            ("Cotton Kitchen Towels (Set of 3)", "6302", 80, "SET", 120.00, 5),
            ("Ceramic Coffee Mug 350ml", "6912", 96, "NOS", 72.50, 12),
            ("Glass Storage Jar 1.5L", "7013", 48, "NOS", 140.00, 18),
            ("Freight & Packing", "996511", 1, "LOT", 1500.00, 18),
        ],
    },
    "phone-photo-bill": {
        "supplier": {
            "name": "Mahalaxmi Packaging Co.",
            "gstin": "27ABCPM6623D1ZK",
            "address": "Gala No. 7, Masjid Bunder Road, Mumbai 400009",
            "state": "Maharashtra",
            "phone": "+91 99675 20914",
        },
        "buyer": {"name": "Kaveri Imports", "gstin": None, "address": "Bhiwandi"},
        "invoice_number": "472",
        "invoice_date": "2026-10-09",
        "place_of_supply": "Maharashtra",
        "mode": "intra",
        "items": [
            ('Corrugated Box 12x10x8"', None, 200, "pcs", 14.50, 18),
            ("Bubble Wrap Roll 1m x 50m", None, 6, "roll", 420.00, 18),
            ('BOPP Tape 2" 65m', None, 48, "pcs", 38.00, 18),
            ("Shipping Labels A4 (100 sh)", None, 5, "pkt", 260.00, 18),
        ],
    },
}


def compute(b):
    lines = [(d, h, q, u, rate, r2(q * rate), g) for d, h, q, u, rate, g in b["items"]]
    taxable = r2(sum(l[5] for l in lines))
    tax = r2(sum(l[5] * l[6] / 100 for l in lines))
    if b["mode"] == "intra":
        cgst = sgst = r2(tax / 2)
        igst = None
        tax = cgst + sgst
    else:
        cgst = sgst = None
        igst = tax
    exact = r2(taxable + tax)
    grand = float(round(exact))
    return lines, taxable, cgst, sgst, igst, r2(grand - exact), grand


def words(n):
    ones = "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split()
    tens = "_ _ Twenty Thirty Forty Fifty Sixty Seventy Eighty Ninety".split()

    def two(x):
        return ones[x] if x < 20 else tens[x // 10] + ("" if x % 10 == 0 else " " + ones[x % 10])

    def three(x):
        h, rest = divmod(x, 100)
        return ((ones[h] + " Hundred" + (" " if rest else "")) if h else "") + (two(rest) if rest else "")

    n = int(n)
    parts = []
    for div, name in ((10000000, "Crore"), (100000, "Lakh"), (1000, "Thousand")):
        if n >= div:
            parts.append(three(n // div) + " " + name)
            n %= div
    if n:
        parts.append(three(n))
    return "Rupees " + " ".join(parts) + " Only"


def fmt_date(iso):
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


PRINTED_CSS = """
@page { size: A4; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; background: #fff; }
.page { width: 1240px; min-height: 1754px; padding: 70px 80px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1d3557; padding-bottom: 22px; }
.brand h1 { margin: 0; font-size: 38px; color: #1d3557; letter-spacing: .3px }
.brand p { margin: 6px 0 0; font-size: 18px; line-height: 1.45; color: #333 }
.title { text-align: right }
.title h2 { margin: 0; font-size: 30px; letter-spacing: 3px; color: #1d3557 }
.title p { margin: 6px 0 0; font-size: 18px }
.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin: 28px 0; font-size: 18px; line-height: 1.55 }
.box { border: 1px solid #c9ced6; padding: 16px 20px; border-radius: 4px }
.box b.h { display:block; font-size: 14px; letter-spacing: 1.5px; color: #555; margin-bottom: 6px }
table { width: 100%; border-collapse: collapse; font-size: 18px }
th { background: #1d3557; color: #fff; font-weight: 600; padding: 12px 10px; text-align: left; font-size: 16px }
td { padding: 12px 10px; border-bottom: 1px solid #dde1e6 }
.n { text-align: right; font-variant-numeric: tabular-nums }
.sum { display: grid; grid-template-columns: 1fr 420px; gap: 40px; margin-top: 26px; font-size: 18px }
.sum table td { padding: 8px 10px }
.grand td { font-weight: 700; font-size: 22px; border-top: 2px solid #1d3557; border-bottom: none }
.words { font-size: 17px; line-height: 1.5 }
.taxsum th { background: #e8ecf2; color: #1d3557 }
.foot { display:flex; justify-content: space-between; margin-top: 60px; font-size: 16px; color:#444 }
.sign { text-align: right } .sign .line { margin-top: 70px; border-top: 1px solid #333; padding-top: 6px; display:inline-block; min-width: 260px; text-align:center }
"""


def printed_html(b):
    lines, taxable, cgst, sgst, igst, ro, grand = compute(b)
    s, by = b["supplier"], b["buyer"]
    rows = "".join(
        f"<tr><td>{i+1}</td><td>{d}</td><td>{h or ''}</td><td class=n>{q}</td><td>{u}</td>"
        f"<td class=n>{inr(rate)}</td><td class=n>{inr(tv)}</td><td class=n>{g}%</td></tr>"
        for i, (d, h, q, u, rate, tv, g) in enumerate(lines)
    )
    if b["mode"] == "intra":
        tax_rows = f"<tr><td>CGST @ 9%</td><td class=n>{inr(cgst)}</td></tr><tr><td>SGST @ 9%</td><td class=n>{inr(sgst)}</td></tr>"
        taxsum = ""
    else:
        tax_rows = f"<tr><td>IGST</td><td class=n>{inr(igst)}</td></tr>"
        by_rate = {}
        for l in lines:
            by_rate.setdefault(l[6], 0)
            by_rate[l[6]] += l[5]
        taxsum = "<table class=taxsum style='margin-top:14px'><tr><th>GST Rate</th><th class=n>Taxable</th><th class=n>IGST</th></tr>" + "".join(
            f"<tr><td>{g}%</td><td class=n>{inr(v)}</td><td class=n>{inr(r2(v*g/100))}</td></tr>" for g, v in sorted(by_rate.items())
        ) + "</table>"
    return f"""<!doctype html><html><head><meta charset=utf-8><style>{PRINTED_CSS}</style></head><body><div class=page>
<div class=top><div class=brand><h1>{s['name']}</h1><p>{s['address']}<br>Ph: {s['phone']}<br><b>GSTIN: {s['gstin']}</b> &nbsp; State: {s['state']}</p></div>
<div class=title><h2>TAX INVOICE</h2><p>Original for Recipient</p></div></div>
<div class=meta><div class=box><b class=h>BILL TO</b><b>{by['name']}</b><br>{by['address']}<br>GSTIN: {by['gstin']}</div>
<div class=box><b class=h>INVOICE DETAILS</b>Invoice No: <b>{b['invoice_number']}</b><br>Invoice Date: <b>{fmt_date(b['invoice_date'])}</b><br>Place of Supply: {b['place_of_supply']}<br>Reverse Charge: No</div></div>
<table><tr><th>#</th><th>Description of Goods</th><th>HSN/SAC</th><th class=n>Qty</th><th>Unit</th><th class=n>Rate</th><th class=n>Taxable Value</th><th class=n>GST</th></tr>{rows}</table>
<div class=sum><div class=words><b>Amount in words:</b><br>{words(grand)}{taxsum}
<p style='margin-top:22px'><b>Bank:</b> HDFC Bank, A/c 50200012345678, IFSC HDFC0000123</p></div>
<table><tr><td>Taxable Value</td><td class=n>{inr(taxable)}</td></tr>{tax_rows}<tr><td>Round Off</td><td class=n>{inr(ro)}</td></tr>
<tr class=grand><td>Grand Total</td><td class=n>&#8377; {inr(grand)}</td></tr></table></div>
<div class=foot><div>Goods once sold will not be taken back.<br>Subject to local jurisdiction. E.&amp;O.E.</div>
<div class=sign>For {s['name']}<br><span class=line>Authorised Signatory</span></div></div>
</div></body></html>"""


def photo_html(b):
    lines, taxable, cgst, sgst, igst, ro, grand = compute(b)
    s = b["supplier"]
    rows = "".join(
        f"<tr><td class=hw>{i+1}</td><td class=hw>{d}</td><td class='hw n'>{q} {u}</td><td class='hw n'>{rate:g}</td><td class='hw n'>{tv:,.2f}</td></tr>"
        for i, (d, h, q, u, rate, tv, g) in enumerate(lines)
    )
    blank = "<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>" * 3
    return f"""<!doctype html><html><head><meta charset=utf-8>
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet">
<style>
body {{ margin:0; width:1200px; height:1600px; overflow:hidden;
  background: radial-gradient(ellipse at 30% 20%, #6b5a48 0%, #3e3329 60%, #2a221b 100%); }}
.paper {{ position:absolute; left:150px; top:120px; width:880px; height:1300px; padding:46px 50px;
  background: linear-gradient(170deg, #fbf7ec 0%, #f4eedd 55%, #e9e1cc 100%);
  transform: rotate(-4.2deg); box-shadow: 18px 26px 40px rgba(0,0,0,.55); font-family: Georgia, serif; color:#2b2a6e; }}
.paper:after {{ content:""; position:absolute; inset:0; pointer-events:none;
  background: linear-gradient(115deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.16) 75%, rgba(0,0,0,.28) 100%); }}
.crease {{ position:absolute; left:0; right:0; top:640px; height:2px; background:rgba(0,0,0,.08); box-shadow:0 1px 0 rgba(255,255,255,.6) }}
h1 {{ margin:0; text-align:center; font-size:40px; letter-spacing:1px; color:#b0262b }}
.sub {{ text-align:center; font-size:17px; line-height:1.5; color:#333 }}
.row {{ display:flex; justify-content:space-between; margin:16px 0 8px; font-size:20px; color:#333 }}
.hw {{ font-family:'Kalam', cursive; color:#1c2a8a; font-size:25px }}
table {{ width:100%; border-collapse:collapse; margin-top:10px; font-size:18px; color:#333 }}
th {{ border:1.5px solid #b0262b; color:#b0262b; padding:8px; font-weight:normal }}
td {{ border-left:1.5px solid #b0262b; border-right:1.5px solid #b0262b; padding:7px 9px; height:42px }}
tr:last-child td {{ border-bottom:1.5px solid #b0262b }}
.n {{ text-align:right }}
.tot {{ margin-top:18px; margin-left:auto; width:420px; font-size:20px; color:#333 }}
.tot div {{ display:flex; justify-content:space-between; padding:4px 0 }}
.stamp {{ position:absolute; right:70px; bottom:90px; width:200px; height:110px; border:3px solid rgba(40,60,170,.55); border-radius:50%;
  color:rgba(40,60,170,.6); font-size:17px; text-align:center; padding-top:30px; transform:rotate(-14deg) }}
</style></head><body><div class=paper><div class=crease></div>
<div class=sub>|| Shree ||</div>
<h1>{s['name'].upper()}</h1>
<div class=sub>{s['address']}<br>Mob: {s['phone']} &nbsp; | &nbsp; GSTIN: {s['gstin']}</div>
<div style="text-align:center;margin-top:10px;font-size:18px;color:#b0262b;letter-spacing:2px">TAX INVOICE / CASH MEMO</div>
<div class=row><span>No. <span class=hw>{b['invoice_number']}</span></span><span>Date: <span class=hw>{fmt_date(b['invoice_date']).replace('/2026','/26')}</span></span></div>
<div class=row><span>M/s. <span class=hw>{b['buyer']['name']}, {b['buyer']['address']}</span></span></div>
<table><tr><th style="width:50px">Sr.</th><th>Particulars</th><th style="width:130px">Qty</th><th style="width:110px">Rate</th><th style="width:160px">Amount</th></tr>{rows}{blank}</table>
<div class=tot>
<div><span>Total</span><span class=hw>{taxable:,.2f}</span></div>
<div><span>CGST 9%</span><span class=hw>{cgst:,.2f}</span></div>
<div><span>SGST 9%</span><span class=hw>{sgst:,.2f}</span></div>
<div><span>R/off</span><span class=hw>{ro:+.2f}</span></div>
<div style="border-top:1.5px solid #b0262b;margin-top:6px;padding-top:8px"><b>G. Total</b><span class=hw style="font-weight:700">&#8377; {grand:,.0f}/-</span></div>
</div>
<div class=stamp>MAHALAXMI<br>PACKAGING</div>
<div style="position:absolute;left:50px;bottom:70px;font-size:16px;color:#555">E.&amp;O.E. &nbsp; Thank you, visit again</div>
</div></body></html>"""


def render(html, out_png, w, h):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(html)
        src = f.name
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}",
         "--virtual-time-budget=4000", f"--screenshot={out_png}", f"file://{src}"],
        check=True, capture_output=True,
    )


def expected(b):
    lines, taxable, cgst, sgst, igst, ro, grand = compute(b)
    return {
        "supplier_name": b["supplier"]["name"],
        "supplier_gstin": b["supplier"]["gstin"],
        "invoice_number": b["invoice_number"],
        "invoice_date": b["invoice_date"],
        "line_items": [{"description": d, "quantity": q, "rate": rate, "taxable_value": tv, "gst_rate": g}
                       for d, h, q, u, rate, tv, g in lines],
        "taxable_value": taxable, "cgst": cgst, "sgst": sgst, "igst": igst, "round_off": ro, "grand_total": grand,
    }


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    EXPECTED.mkdir(parents=True, exist_ok=True)
    for name, b in BILLS.items():
        if name == "phone-photo-bill":
            png = OUT / f"{name}.png"
            render(photo_html(b), png, 1200, 1600)
            subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", str(png),
                            "--out", str(OUT / f"{name}.jpg")], check=True, capture_output=True)
            png.unlink()
        else:
            render(printed_html(b), OUT / f"{name}.png", 1240, 1754)
        (EXPECTED / f"{name}.json").write_text(json.dumps(expected(b), indent=2) + "\n")
        print("wrote", name)

    # The API lets these exact files through without a demo passcode.
    hashes = sorted(hashlib.sha256(f.read_bytes()).hexdigest() for f in OUT.iterdir() if f.is_file())
    HASHES.write_text(json.dumps(hashes, indent=2) + "\n")


if __name__ == "__main__":
    main()
