import sys
import os
import json
import urllib.parse
import requests

# Ensure UTF-8 output
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')  # type: ignore

def search_youtube(query, limit=10):
    results = []
    # 1. Primary: yt_dlp flat search (fast, reliable, bypasses Piped/Invidious outages)
    try:
        import yt_dlp
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore
            search_query = f"ytsearch{limit}:{query}"
            res = ydl.extract_info(search_query, download=False)
            entries = res.get('entries', []) if res else []
            for it in entries:
                if not it:
                    continue
                vid = it.get('id', '')
                if not vid:
                    continue
                title = it.get('title', '')
                uploader = it.get('uploader') or it.get('channel') or 'YouTube Music'
                dur = float(it.get('duration') or 0)
                dur_str = f"{int(dur)//60}:{int(dur)%60:02d}"
                thumbnail = it.get('thumbnail') or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

                results.append({
                    "id": f"yt-{vid}",
                    "title": title,
                    "artist": uploader,
                    "duration": dur,
                    "durStr": dur_str,
                    "coverUrl": thumbnail,
                    "audioUrl": vid,
                    "streamUrl": f"/api/online/stream-yt?id={vid}",
                    "source": "youtube",
                    "sourceName": "YouTube Music"
                })
        if results:
            return results
    except Exception:
        pass

    # 2. Fallback: Piped and Invidious public instances
    encoded = urllib.parse.quote(query)
    instances = [
        "https://api.piped.private.coffee",
        "https://invidious.f5.si",
        "https://inv.nadeko.net",
    ]
    for base in instances:
        try:
            if "invidious" in base:
                r = requests.get(f"{base}/api/v1/search?q={encoded}&type=video", timeout=4)
                if r.status_code == 200:
                    for it in r.json()[:limit]:
                        vid = it.get('videoId')
                        if not vid:
                            continue
                        dur = float(it.get('lengthSeconds', 0))
                        results.append({
                            "id": f"yt-{vid}",
                            "title": it.get('title', ''),
                            "artist": it.get('author', 'YouTube'),
                            "duration": dur,
                            "durStr": f"{int(dur)//60}:{int(dur)%60:02d}",
                            "coverUrl": f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                            "audioUrl": vid,
                            "streamUrl": f"/api/online/stream-yt?id={vid}",
                            "source": "youtube",
                            "sourceName": "YouTube Music"
                        })
                    if results:
                        return results
            else:
                r = requests.get(f"{base}/search?q={encoded}&filter=music_songs", timeout=4)
                if r.status_code == 200:
                    for it in r.json().get('items', [])[:limit]:
                        url_val = it.get('url', '')
                        vid = ""
                        if 'v=' in url_val:
                            vid = url_val.split('v=')[1].split('&')[0]
                        if not vid:
                            continue
                        dur = float(it.get('duration', 0))
                        results.append({
                            "id": f"yt-{vid}",
                            "title": it.get('title', ''),
                            "artist": it.get('uploaderName', 'YouTube Music'),
                            "duration": dur,
                            "durStr": f"{int(dur)//60}:{int(dur)%60:02d}",
                            "coverUrl": it.get('thumbnail') or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                            "audioUrl": vid,
                            "streamUrl": f"/api/online/stream-yt?id={vid}",
                            "source": "youtube",
                            "sourceName": "YouTube Music"
                        })
                    if results:
                        return results
        except Exception:
            continue

    return results

if __name__ == '__main__':
    q = sys.argv[1] if len(sys.argv) > 1 else 'Anacondaz Мама я люблю'
    res = search_youtube(q)
    out_bytes = json.dumps(res, ensure_ascii=False).encode('utf-8')
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout.buffer.write(out_bytes)
    else:
        sys.stdout.write(out_bytes.decode('utf-8', errors='replace'))
