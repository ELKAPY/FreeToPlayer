import json
import sys
import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

HOSTS = [
    "all.api.radio-browser.info",
    "de1.api.radio-browser.info",
    "nl1.api.radio-browser.info",
    "at1.api.radio-browser.info",
]

def fetch_stations(path_or_url):
    clean_path = path_or_url
    if clean_path.startswith("http://") or clean_path.startswith("https://"):
        # Strip scheme and host if full url passed
        idx = clean_path.find("/json/")
        if idx != -1:
            clean_path = clean_path[idx:]

    for host in HOSTS:
        current_url = f"https://{host}{clean_path}"
        try:
            resp = requests.get(current_url, headers=HEADERS, timeout=4)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list):
                    sys.stdout.buffer.write(resp.content)
                    return
        except Exception:
            continue

    sys.stdout.buffer.write(b"[]")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        fetch_stations(sys.argv[1])
    else:
        sys.stdout.buffer.write(b"[]")
