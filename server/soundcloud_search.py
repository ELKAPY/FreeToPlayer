import sys
import json
import urllib.parse
import requests
import re

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')  # type: ignore

CLIENT_ID = "F4NBFDqtGCLXXsV1EvDyDg27XXRYDdKh"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
}

def search_soundcloud(query, limit=15):
    encoded = urllib.parse.quote(query)
    url = f"https://api-v2.soundcloud.com/search/tracks?q={encoded}&client_id={CLIENT_ID}&limit={limit}"
    try:
        r = requests.get(url, headers=headers, timeout=5)
        if r.status_code != 200:
            return []
        data = r.json()
        items = data.get('collection', [])
        results = []
        for it in items:
            tid = str(it.get('id', ''))
            title = it.get('title', '')
            user = it.get('user', {})
            artist = user.get('username', 'Unknown Artist')
            # If artist looks like User 12345678, try extracting real artist from "Artist - Title"
            if re.match(r'(?i)^user[\s_-]*\d*', artist) or artist.lower() in ('unknown', 'unknown artist'):
                if ' - ' in title:
                    parts = title.split(' - ', 1)
                    if parts[0].strip() and not re.match(r'(?i)^user[\s_-]*\d*', parts[0].strip()):
                        artist = parts[0].strip()
                        title = parts[1].strip()
                else:
                    artist = ''
            duration_sec = (it.get('duration', 0)) / 1000.0
            artwork = it.get('artwork_url') or user.get('avatar_url') or ''
            if artwork and 'large' in artwork:
                artwork = artwork.replace('large', 't500x500')
            
            # Find progressive stream or stream URL
            media = it.get('media', {}).get('transcodings', [])
            audio_url = ""
            for m in media:
                if m.get('format', {}).get('protocol') == 'progressive':
                    audio_url = m.get('url', '')
                    break
            if not audio_url and media:
                audio_url = media[0].get('url', '')

            track_auth = it.get('track_authorization', '')

            m_val = int(duration_sec // 60)
            s_val = int(duration_sec % 60)
            dur_str = f"{m_val}:{s_val:02d}"

            params = urllib.parse.urlencode({'url': audio_url, 'auth': track_auth, 'title': title})

            results.append({
                "id": f"sc_{tid}",
                "title": title,
                "artist": artist,
                "duration": round(duration_sec, 1),
                "durStr": dur_str,
                "coverUrl": artwork,
                "audioUrl": audio_url,
                "streamUrl": f"/api/online/stream-sc?{params}",
                "source": "soundcloud",
                "sourceName": "SoundCloud"
            })
        return results
    except Exception as e:
        return []

if __name__ == '__main__':
    q = sys.argv[1] if len(sys.argv) > 1 else 'Queen'
    tracks = search_soundcloud(q)
    out_bytes = json.dumps(tracks, ensure_ascii=False).encode('utf-8')
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout.buffer.write(out_bytes)
    else:
        sys.stdout.write(out_bytes.decode('utf-8', errors='replace'))
