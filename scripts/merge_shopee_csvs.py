import csv, os, re

BASE = r'C:\Users\user\Downloads'
OUT = r'C:\Users\user\OneDrive\桌面\IG2\assets\google_sheets\products_import.csv'
SHOP_ID = '179481064'

def read_csv(path, skip=6):
    with open(path, encoding='utf-8-sig') as f:
        return list(csv.reader(f))[skip:]

basic = read_csv(os.path.join(BASE, 'mass_update_basic_info_179481064_20260520163812.csv'))
sales = read_csv(os.path.join(BASE, 'mass_update_sales_info_179481064_20260520163846.csv'))
media = read_csv(os.path.join(BASE, 'mass_update_media_info_179481064_20260520163854.csv'))

# price lookup: product_id -> min price
prices = {}
for r in sales:
    pid = r[0].strip()
    try:
        p = float(r[6].strip()) if r[6].strip() else 0
    except:
        p = 0
    if pid not in prices or p < prices[pid]:
        prices[pid] = p

# variation names per product
vnames = {}
for r in sales:
    pid = r[0].strip()
    vn = r[3].strip() if len(r) > 3 else ''
    if vn:
        vnames.setdefault(pid, []).append(vn)

# cover image + category per product
mediainfo = {}
for r in media:
    pid = r[0].strip()
    cover = r[4].strip() if len(r) > 4 else ''
    cat = r[3].strip() if len(r) > 3 else ''
    mediainfo[pid] = (cover, cat)

CAT_SCENE = {
    'Chairs & Stools': '客廳', 'Sofas & Armchairs': '客廳',
    'Desks & Tables': '書房', 'Beds': '臥室', 'Wardrobes': '臥室',
    'Shelves': '書房', 'Cabinets': '客廳', 'Storage': '玄關',
    'Lighting': '客廳', 'Mirrors': '玄關', 'Rugs': '客廳',
    'Decor': '客廳', 'Tables': '餐廳',
}

MATERIAL_KWS = ['實木', '原木', '木', '鐵', '金屬', '不鏽鋼', '鋁', '藤',
                '布', '絨', '皮革', '塑膠', '亞麻', '竹', '貓抓皮', '羊羔絨']

SELLING_KWS = ['小戶型', '輕奢', '北歐', '簡約', '日式', '工業風', '鄉村',
               '復古', '現代', '可折疊', '可升降', '多功能', '可調', '旋轉', '滑輪']

SCENE_KWS = {
    '客廳': ['客廳', '沙發', '邊几', '茶几'],
    '臥室': ['床', '臥室', '寢', '床頭'],
    '書房': ['書桌', '書房', '辦公', '電腦'],
    '餐廳': ['餐桌', '餐椅', '吧檯', '酒吧'],
    '玄關': ['玄關', '鞋櫃', '穿鞋'],
}

def find_kw(text, kws):
    return [kw for kw in kws if kw in text]

def extract_size(text):
    m = re.search(r'(\d+[xX×]\d+\s*(?:cm|CM|ＣＭ|厘米)?)', text)
    if m: return m.group(1)
    m = re.search(r'(\d+\s*[xX×]\s*\d+)', text)
    if m: return m.group(1)
    m = re.search(r'(?:直徑|直径)\s*(\d+)', text)
    if m: return '直徑{}cm'.format(m.group(1))
    m = re.search(r'(\d+)\s*[xX×\*]\s*(\d+)\s*[xX×\*]\s*(\d+)', text)
    if m: return '{}x{}x{}cm'.format(m.group(1), m.group(2), m.group(3))
    m = re.search(r'(\d+)\s*[xX]\s*(\d+)', text)
    if m: return '{}x{}cm'.format(m.group(1), m.group(2))
    m = re.search(r'(\d+)\s*(?:cm|CM|ＣＭ|厘米)', text)
    if m: return m.group(0)
    return ''

header = ['id', 'name', 'price', 'size', 'material', 'selling', 'photo_name', 'link', 'scene']
rows = [header]

for r in basic:
    pid = r[0].strip()
    name = r[2].strip() if len(r) > 2 else ''
    desc = r[3].strip() if len(r) > 3 else ''
    if not pid or not name:
        continue

    price = prices.get(pid, 0)
    cover, cat = mediainfo.get(pid, ('', ''))

    # Collect all text for keyword extraction
    vns = vnames.get(pid, [])
    vn_text = ' '.join(vns)
    all_text = name + ' ' + vn_text

    # Size: from variation names first, then product name
    size = extract_size(vn_text) or extract_size(name)

    # Material from all text
    mats = find_kw(all_text, MATERIAL_KWS)
    material = ' '.join(mats[:3]) if mats else ''

    # Selling points from name
    sells = find_kw(name, SELLING_KWS)
    selling = ' '.join(sells[:3]) if sells else ''

    # Scene from category
    scene = ''
    for ck, sv in CAT_SCENE.items():
        if ck in cat:
            scene = sv
            break
    if not scene:
        for sv, kws in SCENE_KWS.items():
            if any(kw in name for kw in kws):
                scene = sv
                break
    if not scene:
        scene = '客廳'

    link = 'https://shopee.tw/product/{}/{}'.format(SHOP_ID, pid)
    rows.append([pid, name, price, size, material, selling, cover, link, scene])

with open(OUT, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f)
    w.writerows(rows)

print('Done: {} products -> {}'.format(len(rows) - 1, OUT))
print()
for r in rows[1:5]:
    print('  ID={} | Price={} | Size={} | Material={} | Selling={} | Scene={} | Img={}'.format(
        r[0], r[2], r[3] or '-', r[4] or '-', r[5] or '-', r[8] or '-', r[6][:50] if r[6] else '-'))
print()
# count non-empty fields
nonempty = {k: 0 for k in ['size', 'material', 'selling', 'photo_name', 'scene']}
for r in rows[1:]:
    if r[3]: nonempty['size'] += 1
    if r[4]: nonempty['material'] += 1
    if r[5]: nonempty['selling'] += 1
    if r[6]: nonempty['photo_name'] += 1
    if r[8]: nonempty['scene'] += 1
print('Field coverage:')
for k, v in nonempty.items():
    print('  {}: {}/{} ({:.0f}%)'.format(k, v, len(rows)-1, v/(len(rows)-1)*100))
