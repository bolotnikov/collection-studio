"""Download authorized Miro originals and inventory them without altering pixels."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SETS = {
    1: '01-unreviewed', 2: '02-sports', 3: '03-school', 4: '04-amusement-park',
    5: '05-cooling-off', 6: '06-garden', 7: '07-unreviewed', 8: '08-scout-camp',
    9: '09-unreviewed', 10: '10-beach', 11: '11-music-festival', 12: '12-unreviewed',
    13: '13-road-trip', 14: '14-pool', 15: '15-sightseeing', 16: '16-summer-party',
}


def download(item):
    result = item.get('result', {})
    url = result.get('download_url')
    record = {k: item[k] for k in ('id', 'group')}
    record['miro_url'] = f"https://miro.com/app/board/uXjVEOqNGVA=/?moveToWidget={item['id']}"
    record['board_x'] = result.get('x')
    record['board_y'] = result.get('y')
    if not url:
        return {**record, 'status': 'pending_miro_limit'}
    disposition = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get('response-content-disposition', [''])[0]
    match = re.search(r'filename="([^"]+)"', disposition)
    filename = Path(match.group(1)).name if match else item['id'] + '.png'
    folder = ROOT / 'art' / 'miro' / item['group']
    card_match = re.search(r'CardC6_card_(\d+)\.png$', filename)
    if item['group'] == 'cards' and card_match:
        card_number = int(card_match.group(1))
        set_number = (card_number - 1) // 10 + 1
        folder = folder / SETS[set_number]
        record['card_number'] = card_number
        record['inferred_set'] = SETS[set_number]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (item['id'] + '__' + filename)
    previous_path = ROOT / 'art' / 'miro' / item['group'] / path.name
    if previous_path.exists() and previous_path != path and not path.exists():
        previous_path.rename(path)
    try:
        if not path.exists():
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
            path.write_bytes(data)
        data = path.read_bytes()
        with Image.open(path) as img:
            img.load()
            dimensions, mode, fmt = img.size, img.mode, img.format
        return {**record, 'status': 'downloaded', 'path': str(path.relative_to(ROOT)), 'original_filename': filename,
                'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                'width': dimensions[0], 'height': dimensions[1], 'mode': mode, 'format': fmt}
    except Exception as exc:
        return {**record, 'status': 'download_error', 'error': str(exc)}


def main():
    items = json.loads((ROOT / 'references/miro/download-urls.json').read_text())
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        records = list(pool.map(download, items))
    target = ROOT / 'references/miro/asset-manifest.json'
    target.write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
    counts = {s: sum(r['status'] == s for r in records) for s in sorted({r['status'] for r in records})}
    print(json.dumps(counts))


if __name__ == '__main__':
    main()
