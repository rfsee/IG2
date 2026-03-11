import csv
import json
from datetime import datetime
from pathlib import Path

POSTS_FILE = Path('assets/google_sheets/posts_import.csv')
REPORT_JSON = Path('reports/import_preflight_report.json')
REPORT_TXT = Path('reports/preflight_summary.txt')

REQUIRED_COLUMNS = [
    'Post ID', '平台', '類型', '主題', 'CTA', '狀態', '發布時間'
]
ALLOWED_STATUS = {'草稿', '待拍', '待上架', '已發佈'}
ALLOWED_TYPE = {'Reels', 'Feed', 'Story'}


def write_report(total, issues, warnings):
    go = len(issues) == 0
    status = 'GO' if go else 'NO-GO'

    payload = {
        'status': status,
        'rows_checked': total,
        'errors': issues,
        'warnings': warnings,
    }
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    lines = [
        f'Import Preflight: {status}',
        f'Rows checked: {total}',
        f'Errors: {len(issues)}',
        f'Warnings: {len(warnings)}',
        ''
    ]
    if issues:
        lines.append('[Errors]')
        lines.extend(f'- {x}' for x in issues)
        lines.append('')
    if warnings:
        lines.append('[Warnings]')
        lines.extend(f'- {x}' for x in warnings)

    REPORT_TXT.write_text(chr(10).join(lines), encoding='utf-8')
    return 0 if go else 2


def main():
    issues = []
    warnings = []
    total = 0
    seen_ids = set()

    if not POSTS_FILE.exists():
        issues.append(f'缺少檔案: {POSTS_FILE}')
        return write_report(total, issues, warnings)

    with POSTS_FILE.open('r', encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames or []

        for col in REQUIRED_COLUMNS:
            if col not in columns:
                issues.append(f'缺少欄位: {col}')

        if issues:
            return write_report(total, issues, warnings)

        for row in reader:
            total += 1
            row_id = (row.get('Post ID') or '').strip()
            post_type = (row.get('類型') or '').strip()
            status = (row.get('狀態') or '').strip()
            publish_time = (row.get('發布時間') or '').strip()
            cta = (row.get('CTA') or '').strip()
            title = (row.get('主題') or '').strip()
            asset_link = (row.get('素材連結') or '').strip()
            product_link = (row.get('商品連結') or '').strip()

            if not row_id:
                issues.append(f'第{total}列: Post ID 為空')
            elif row_id in seen_ids:
                issues.append(f'第{total}列: Post ID 重複 ({row_id})')
            else:
                seen_ids.add(row_id)

            if post_type not in ALLOWED_TYPE:
                issues.append(f'第{total}列: 類型不合法 ({post_type})')
            if status not in ALLOWED_STATUS:
                issues.append(f'第{total}列: 狀態不合法 ({status})')
            if not title:
                issues.append(f'第{total}列: 主題為空')
            if not cta:
                issues.append(f'第{total}列: CTA 為空')

            try:
                datetime.strptime(publish_time, '%Y-%m-%d %H:%M')
            except ValueError:
                issues.append(f'第{total}列: 發布時間格式錯誤 ({publish_time})，需 YYYY-MM-DD HH:MM')

            if asset_link.startswith('待補') or not asset_link:
                warnings.append(f'第{total}列: 素材連結尚未完成')
            if product_link.startswith('待補') or not product_link:
                warnings.append(f'第{total}列: 商品連結尚未完成')

    return write_report(total, issues, warnings)


if __name__ == '__main__':
    raise SystemExit(main())
