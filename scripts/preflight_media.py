import csv
from pathlib import Path

MANIFEST = Path('assets/media_manifest.csv')
OUT = Path('reports/media_preflight_report.txt')
ALLOWED = {'mp4', 'jpg', 'jpeg', 'png'}


def main():
    if not MANIFEST.exists():
        OUT.write_text('Media Preflight: NO-GO' + chr(10) + '缺少 media manifest。', encoding='utf-8')
        return 2

    errors = []
    warnings = []
    total = 0

    with MANIFEST.open('r', encoding='utf-8-sig', newline='') as f:
        rows = csv.DictReader(f)
        for row in rows:
            total += 1
            post_id = (row.get('post_id') or '').strip()
            file_path = (row.get('file_path') or '').strip()
            fmt = (row.get('format') or '').strip().lower()

            if not post_id:
                errors.append(f'第{total}列: post_id 為空')
            if fmt not in ALLOWED:
                errors.append(f'第{total}列: format 不合法 ({fmt})')
            if not file_path:
                errors.append(f'第{total}列: file_path 為空')
                continue

            p = Path(file_path)
            if not p.exists():
                errors.append(f'第{total}列: 素材不存在 ({file_path})')
            else:
                size = p.stat().st_size
                if size == 0:
                    warnings.append(f'第{total}列: 檔案大小為 0 ({file_path})')

    status = 'GO' if not errors else 'NO-GO'
    lines = [
        f'Media Preflight: {status}',
        f'Rows checked: {total}',
        f'Errors: {len(errors)}',
        f'Warnings: {len(warnings)}',
        ''
    ]
    if errors:
        lines.append('[Errors]')
        lines.extend(f'- {x}' for x in errors)
        lines.append('')
    if warnings:
        lines.append('[Warnings]')
        lines.extend(f'- {x}' for x in warnings)

    OUT.write_text(chr(10).join(lines), encoding='utf-8')
    return 0 if status == 'GO' else 2


if __name__ == '__main__':
    raise SystemExit(main())
