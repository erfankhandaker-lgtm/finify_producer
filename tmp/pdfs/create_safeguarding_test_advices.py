from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas
import fitz


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)
RENDERED = ROOT / "tmp" / "pdfs" / "rendered"
RENDERED.mkdir(parents=True, exist_ok=True)

try:
    pdfmetrics.registerFont(TTFont("AdviceSans", "/System/Library/Fonts/Supplemental/Arial.ttf"))
    FONT = "AdviceSans"
except Exception:
    FONT = "Helvetica"


def create(currency: str) -> None:
    reference = f"TEST-SAFE-20260731-{currency}"
    path = OUTPUT / f"safeguarding-test-deposit-{currency.lower()}.pdf"
    page = canvas.Canvas(str(path), pagesize=A4)
    width, height = A4

    page.setFillColor(colors.HexColor("#07100c"))
    page.rect(0, 0, width, height, fill=1, stroke=0)
    page.setFillColor(colors.HexColor("#1c8b60"))
    page.rect(0, height - 92, width, 92, fill=1, stroke=0)

    page.setFillColor(colors.white)
    page.setFont(FONT, 19)
    page.drawString(42, height - 54, "TEST BANK DEPOSIT ADVICE")
    page.setFont(FONT, 8)
    page.drawString(43, height - 72, "FINIFY MULTI-CURRENCY SAFEGUARDING TEST")

    page.setFillColor(colors.HexColor("#efc56a"))
    page.setFont(FONT, 11)
    page.drawString(42, height - 132, "TEST EVIDENCE - NOT A REAL BANK TRANSFER")

    details = [
        ("Value date", "31 July 2026"),
        ("Currency", currency),
        ("Amount", f"{currency} 100,000.00"),
        ("Bank", "Finify Test Settlement Bank"),
        ("Bank account", f"TEST-SAFEGUARDING-{currency}"),
        ("Reference", reference),
        ("Beneficiary", "Finify Safeguarding Account"),
        ("Purpose", "Safeguarding funding for end-to-end testing"),
    ]
    y = height - 184
    for label, value in details:
        page.setFillColor(colors.HexColor("#6c8b7d"))
        page.setFont(FONT, 8)
        page.drawString(42, y, label.upper())
        page.setFillColor(colors.HexColor("#d8e9e1"))
        page.setFont(FONT, 11)
        page.drawString(190, y, value)
        page.setStrokeColor(colors.HexColor("#1b352a"))
        page.line(42, y - 12, width - 42, y - 12)
        y -= 48

    page.setFillColor(colors.HexColor("#10251c"))
    page.roundRect(42, 92, width - 84, 82, 6, fill=1, stroke=0)
    page.setFillColor(colors.HexColor("#86ac9a"))
    page.setFont(FONT, 8)
    page.drawString(58, 145, "CONTROL STATEMENT")
    page.setFillColor(colors.HexColor("#c8ded4"))
    page.setFont(FONT, 9)
    page.drawString(58, 124, "Generated solely to exercise Treasury maker/checker, MinIO evidence,")
    page.drawString(58, 108, "wallet funding, audit, and multi-currency accounting controls.")

    page.setFillColor(colors.HexColor("#49675a"))
    page.setFont(FONT, 7)
    page.drawString(42, 42, f"Finify test evidence | {reference} | Page 1 of 1")
    page.save()
    document = fitz.open(path)
    rendered = document[0].get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    rendered.save(RENDERED / f"{currency.lower()}.png")
    document.close()


for code in ("GBP", "UGX", "USD"):
    create(code)
