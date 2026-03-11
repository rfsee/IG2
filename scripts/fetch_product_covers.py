import csv
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_CSV = ROOT / "assets" / "google_sheets" / "products_import.csv"
MEDIA_XLSX = Path(r"C:\Users\user\OneDrive\桌面\shopeeinfo\mass_update_media_info_179481064_20251215174807.xlsx")
OUT_JSON = ROOT / "assets" / "product_covers.json"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def extract_product_id(link: str) -> str:
    text = (link or "").strip()
    m = re.search(r"/product/\d+/(\d+)", text)
    if m:
        return m.group(1)
    m = re.search(r"/i\.\d+\.(\d+)", text)
    return m.group(1) if m else ""


def col_index(cell_ref: str) -> int:
    letters = "".join(ch for ch in cell_ref if ch.isalpha())
    value = 0
    for ch in letters:
        value = value * 26 + (ord(ch.upper()) - 64)
    return value - 1


def read_shared_strings(zf: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for si in root.findall(f"{NS}si"):
        text = "".join((t.text or "") for t in si.iter(f"{NS}t"))
        values.append(text)
    return values


def read_sheet_rows(zf: zipfile.ZipFile, shared: list[str]) -> list[dict[int, str]]:
    root = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    out: list[dict[int, str]] = []
    for row in root.findall(f".//{NS}sheetData/{NS}row"):
        data: dict[int, str] = {}
        for c in row.findall(f"{NS}c"):
            idx = col_index(c.get("r", "A1"))
            cell_type = c.get("t")
            v = c.find(f"{NS}v")
            is_t = c.find(f"{NS}is/{NS}t")
            if is_t is not None:
                val = is_t.text or ""
            elif v is None:
                val = ""
            elif cell_type == "s":
                shared_idx = int(v.text or "0")
                val = shared[shared_idx] if shared_idx < len(shared) else ""
            else:
                val = v.text or ""
            data[idx] = val
        out.append(data)
    return out


def parse_cover_map() -> dict[str, str]:
    if not MEDIA_XLSX.exists():
        return {}

    with zipfile.ZipFile(MEDIA_XLSX) as zf:
        shared = read_shared_strings(zf)
        rows = read_sheet_rows(zf, shared)

    header: list[str] | None = None
    for row in rows:
        values = [row.get(i, "") for i in range(max(row.keys(), default=-1) + 1)]
        if "et_title_product_id" in values and "ps_item_cover_image" in values:
            header = values
            break
    if not header:
        return {}

    product_col = header.index("et_title_product_id")
    cover_col = header.index("ps_item_cover_image")
    out: dict[str, str] = {}
    for row in rows:
        pid = str(row.get(product_col, "")).strip()
        cover = str(row.get(cover_col, "")).strip()
        if pid.isdigit() and cover.startswith("http"):
            out[pid] = cover
    return out


def main() -> None:
    cover_map = parse_cover_map()
    if not PRODUCTS_CSV.exists():
        raise SystemExit(f"products csv not found: {PRODUCTS_CSV}")

    output = []
    with PRODUCTS_CSV.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            link = (row.get("主圖", "") or row.get("商品連結", "")).strip()
            pid = extract_product_id(link)
            output.append(
                {
                    "name": row.get("商品名稱", ""),
                    "product_link": link,
                    "product_id": pid,
                    "cover_url": cover_map.get(pid, ""),
                }
            )

    OUT_JSON.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    ok = sum(1 for item in output if item["cover_url"])
    print(f"DONE {ok}/{len(output)} covers -> {OUT_JSON}")


if __name__ == "__main__":
    main()
