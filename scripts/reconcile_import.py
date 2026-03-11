import csv
from pathlib import Path

PLATFORM_POSTS = Path('assets/google_sheets/posts_import.csv')
WEEK_FILES = [Path('assets/week1-posts.csv'), Path('assets/week2-posts.csv')]
OUT = Path('reports/reconciliation_report.txt')


def normalize(s):
    return ''.join((s or '').replace('#', '').replace('：', ':').replace(' ', '').lower().split())


def read_rows(path):
    with path.open('r', encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def main():
    missing = [str(p) for p in [PLATFORM_POSTS, *WEEK_FILES] if not p.exists()]
    if missing:
        OUT.write_text('Status: NO-GO' + chr(10) + '缺少必要檔案: ' + ', '.join(missing), encoding='utf-8')
        return 2

    airtable_rows = read_rows(PLATFORM_POSTS)
    week_rows = []
    for p in WEEK_FILES:
        week_rows.extend(read_rows(p))

    airtable_titles = {normalize(r.get('主題')) for r in airtable_rows if r.get('主題')}
    week_titles = {normalize(r.get('title')) for r in week_rows if r.get('title')}

    missing_in_airtable = sorted(week_titles - airtable_titles)
    missing_in_week = sorted(airtable_titles - week_titles)

    status = 'GO' if not missing_in_airtable else 'NO-GO'
    lines = [
        f'Status: {status}',
        'Reconciliation Report',
        f'Platform rows: {len(airtable_rows)}',
        f'Week rows (W1+W2): {len(week_rows)}',
        f'Missing in Platform data: {len(missing_in_airtable)}',
        f'Missing in Week CSVs: {len(missing_in_week)}',
        ''
    ]

    if missing_in_airtable:
        lines.append('[Missing in Platform data]')
        lines.extend(f'- {x}' for x in missing_in_airtable)
        lines.append('')
    if missing_in_week:
        lines.append('[Missing in Week CSVs]')
        lines.extend(f'- {x}' for x in missing_in_week)

    OUT.write_text(chr(10).join(lines), encoding='utf-8')
    return 0 if status == 'GO' else 2


if __name__ == '__main__':
    raise SystemExit(main())
