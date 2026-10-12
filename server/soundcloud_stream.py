import sys
import os
import json
import re
import requests

CLIENT_ID = "F4NBFDqtGCLXXsV1EvDyDg27XXRYDdKh"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
}

def resolve_sc(url='', auth='', track_id=''):
    if not url and not track_id:
        return ''
    if url and ('sndcdn.com' in url or url.endswith('.mp3')):
        return url

    # Extract track_id from url if not provided
    if not track_id and url:
        m = re.search(r'tracks[:/](\d+)', url)
        if m:
            track_id = m.group(1)

    # 1. Direct resolution with provided url and auth
    if url and ('api-v2.soundcloud.com' in url or 'api.soundcloud.com' in url):
        sep = '&' if '?' in url else '?'
        req_url = f"{url}{sep}client_id={CLIENT_ID}"
        if auth:
            req_url += f"&track_authorization={auth}"
        try:
            r = requests.get(req_url, headers=headers, timeout=6)
            if r.status_code == 200:
                direct = r.json().get('url', '')
                if direct:
                    return direct
        except Exception:
            pass

    # 2. Query track by ID to obtain fresh auth & progressive stream
    if track_id:
        clean_tid = track_id.replace('sc_', '').strip()
        try:
            t_url = f"https://api-v2.soundcloud.com/tracks/{clean_tid}?client_id={CLIENT_ID}"
            r = requests.get(t_url, headers=headers, timeout=6)
            if r.status_code == 200:
                tdata = r.json()
                t_auth = tdata.get('track_authorization', '')
                media = tdata.get('media', {}).get('transcodings', [])
                prog_url = ''
                for m in media:
                    if m.get('format', {}).get('protocol') == 'progressive':
                        prog_url = m.get('url', '')
                        break
                if not prog_url and media:
                    prog_url = media[0].get('url', '')
                if prog_url:
                    sep = '&' if '?' in prog_url else '?'
                    ru = f"{prog_url}{sep}client_id={CLIENT_ID}"
                    if t_auth:
                        ru += f"&track_authorization={t_auth}"
                    r2 = requests.get(ru, headers=headers, timeout=6)
                    if r2.status_code == 200:
                        direct = r2.json().get('url', '')
                        if direct:
                            return direct
        except Exception:
            pass

    return ''

def download_sc_audio(url='', auth='', track_id='', out_path=''):
    direct = resolve_sc(url, auth, track_id)
    if not direct or not out_path:
        return False
    try:
        r = requests.get(direct, headers={'User-Agent': headers['User-Agent']}, stream=True, timeout=30)
        if r.status_code in (200, 206):
            with open(out_path, 'wb') as f:
                for chunk in r.iter_content(chunk_size=32768):
                    if chunk:
                        f.write(chunk)
            return os.path.exists(out_path) and os.path.getsize(out_path) > 1000
    except Exception:
        pass
    return False

if __name__ == '__main__':
    args = sys.argv[1:]
    if len(args) >= 5 and args[0] == '--download':
        url = args[1]
        auth = args[2]
        track_id = args[3]
        out_path = args[4]
        ok = download_sc_audio(url, auth, track_id, out_path)
        print("OK" if ok else "FAIL")
    else:
        url = args[0] if len(args) > 0 else ''
        auth = args[1] if len(args) > 1 else ''
        track_id = args[2] if len(args) > 2 else ''
        direct_url = resolve_sc(url, auth, track_id)
        print(direct_url)
