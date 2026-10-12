import sys
import os
import json
import requests

def resolve_youtube_stream(vid):
    if not vid:
        return ''
    url = f"https://www.youtube.com/watch?v={vid}" if not vid.startswith('http') else vid

    # 1. Primary: yt_dlp
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore
            info = ydl.extract_info(url, download=False)
            u = info.get('url', '')
            if u:
                return u
    except Exception:
        pass

    # 2. Fallback: Piped & Invidious instances
    clean_id = vid
    if 'v=' in vid:
        clean_id = vid.split('v=')[1].split('&')[0]
    elif 'youtu.be/' in vid:
        clean_id = vid.split('youtu.be/')[1].split('?')[0]

    instances = [
        ("piped", "https://api.piped.private.coffee"),
        ("invidious", "https://invidious.f5.si"),
        ("invidious", "https://inv.nadeko.net"),
        ("invidious", "https://invidious.projectsegfau.lt"),
    ]
    for kind, base in instances:
        try:
            if kind == "piped":
                r = requests.get(f"{base}/streams/{clean_id}", timeout=4)
                if r.status_code == 200:
                    for s in r.json().get('audioStreams', []):
                        if s.get('url'):
                            return s.get('url')
            else:
                r = requests.get(f"{base}/api/v1/videos/{clean_id}", timeout=4)
                if r.status_code == 200:
                    for f in r.json().get('adaptiveFormats', []):
                        if 'audio' in f.get('type', '') and f.get('url'):
                            return f.get('url')
        except Exception:
            continue

    return ''

def download_youtube_audio(vid, out_path):
    if not vid or not out_path:
        return False
    url = f"https://www.youtube.com/watch?v={vid}" if not vid.startswith('http') else vid
    try:
        import yt_dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_path,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore
            ydl.download([url])
        return os.path.exists(out_path) and os.path.getsize(out_path) > 1000
    except Exception:
        return False

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        sys.exit(0)

    if len(args) >= 3 and args[0] == '--download':
        vid = args[1]
        out_path = args[2]
        ok = download_youtube_audio(vid, out_path)
        print("OK" if ok else "FAIL")
    else:
        vid = args[0]
        stream_url = resolve_youtube_stream(vid)
        print(stream_url)
