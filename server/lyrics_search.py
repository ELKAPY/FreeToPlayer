import sys
import json
import urllib.parse
import requests

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')  # type: ignore

headers = {
    'User-Agent': 'FreeToPlayer/1.0.0 (https://github.com/freetoplayer)',
    'Accept': 'application/json',
}

def clean_name(s):
    import re
    s = re.sub(r'\(.*?\)|\[.*?\]', '', s)
    s = re.sub(r'(?i)\b(remastered|remaster|deluxe|expanded|official|video|audio|clean|explicit)\b', '', s)
    return s.strip()

def get_lyrics(artist, title, duration=0.0):
    artist = (artist or '').strip()
    title = (title or '').strip()

    # If artist looks like User 123... or unknown, try splitting "Artist - Title"
    import re
    if re.match(r'(?i)^user[\s_-]*\d*$', artist) or artist.lower() in ('unknown', 'неизвестный исполнитель'):
        if ' - ' in title:
            parts = title.split(' - ', 1)
            artist = parts[0].strip()
            title = parts[1].strip()
        else:
            artist = ''

    if ' - ' in title and not artist:
        parts = title.split(' - ', 1)
        artist = parts[0].strip()
        title = parts[1].strip()

    clean_t = clean_name(title)
    clean_a = clean_name(artist).split(',')[0].split('&')[0].strip()

    # 1. Exact GET without duration (duration mismatch causes 404/503 on lrclib)
    if clean_a and clean_t:
        try:
            params = {'artist_name': clean_a, 'track_name': clean_t}
            r = requests.get('https://lrclib.net/api/get', params=params, headers=headers, timeout=6)
            if r.status_code == 200:
                data = r.json()
                if data.get('syncedLyrics') or data.get('plainLyrics'):
                    return data
        except Exception:
            pass

    # 2. Structured search
    queries = []
    if clean_a and clean_t:
        queries.append(f"{clean_a} {clean_t}")
    if clean_t:
        queries.append(clean_t)
    if title and title != clean_t:
        queries.append(title)

    for q in queries:
        try:
            r = requests.get('https://lrclib.net/api/search', params={'q': q}, headers=headers, timeout=6)
            if r.status_code == 200:
                items = r.json()
                if isinstance(items, list) and items:
                    # Prefer item with synced lyrics
                    best = next((it for it in items if it.get('syncedLyrics')), None)
                    if not best:
                        best = next((it for it in items if it.get('plainLyrics')), None)
                    if best:
                        return best
        except Exception:
            continue

    return None

if __name__ == '__main__':
    artist = sys.argv[1] if len(sys.argv) > 1 else ''
    title = sys.argv[2] if len(sys.argv) > 2 else ''
    dur = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else 0.0

    res = get_lyrics(artist, title, dur)
    if res:
        out_bytes = json.dumps(res, ensure_ascii=False).encode('utf-8')
        if hasattr(sys.stdout, 'buffer'):
            sys.stdout.buffer.write(out_bytes)
        else:
            sys.stdout.write(out_bytes.decode('utf-8', errors='replace'))
    else:
        sys.exit(1)
