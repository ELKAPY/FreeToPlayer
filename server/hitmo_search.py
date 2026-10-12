import sys
import json
import urllib.parse
import requests
from bs4 import BeautifulSoup

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')  # type: ignore

def search_hitmo(query, limit=20):
    url = "https://rus.hitmotop.com/search?q=" + urllib.parse.quote(query)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
        'Referer': 'https://rus.hitmotop.com/'
    }
    try:
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, 'html.parser')
        tracks = soup.select('.track__info')
        results = []
        for t in tracks[:limit]:
            title_el = t.select_one('.track__title')
            artist_el = t.select_one('.track__desc')
            dl_el = t.find_parent('li')
            btn = dl_el.select_one('.track__download-btn') if dl_el else None
            time_el = t.select_one('.track__fulltime')
            cover_el = dl_el.select_one('.track__img') if dl_el else None

            audio_path = str(btn.get('href', '')) if btn else ''
            if not audio_path:
                continue

            title = title_el.text.strip() if title_el else 'Без названия'
            artist = artist_el.text.strip() if artist_el else 'Неизвестный исполнитель'
            dur_str = time_el.text.strip() if time_el else '0:00'

            cover_url = ''
            if cover_el and cover_el.get('style'):
                st = str(cover_el.get('style', ''))
                if 'url(' in st:
                    cover_url = st.split('url(')[1].split(')')[0].strip('\'"')

            audio_url = "https://rus.hitmotop.com" + audio_path

            results.append({
                'id': 'hitmo_' + str(abs(hash(audio_path))),
                'title': title,
                'artist': artist,
                'durStr': dur_str,
                'coverUrl': cover_url,
                'audioUrl': audio_url,
                'streamUrl': f"/api/online/stream?url={urllib.parse.quote(audio_url)}&artist={urllib.parse.quote(artist)}&title={urllib.parse.quote(title)}",
                'source': 'hitmo',
                'sourceName': 'Hitmo'
            })
        return results
    except Exception as e:
        return []

if __name__ == '__main__':
    q = sys.argv[1] if len(sys.argv) > 1 else 'Anacondaz Мама я люблю'
    res = search_hitmo(q)
    out_bytes = json.dumps(res, ensure_ascii=False).encode('utf-8')
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout.buffer.write(out_bytes)
    else:
        sys.stdout.write(out_bytes.decode('utf-8', errors='replace'))
