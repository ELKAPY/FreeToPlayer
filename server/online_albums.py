import json
import re
import sys
import requests

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json",
}

def search_deezer_albums(query):
    albums = []
    try:
        url = f"https://api.deezer.com/search/album?q={requests.utils.quote(query)}&limit=25"
        resp = requests.get(url, headers=HEADERS, timeout=8)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            for item in data:
                cov = item.get("cover_xl") or item.get("cover_big") or item.get("cover_medium") or ""
                artist_name = item.get("artist", {}).get("name") or "Разные исполнители"
                albums.append({
                    "id": f"dz_alb_{item.get('id')}",
                    "title": item.get("title") or "Без названия",
                    "artist": artist_name,
                    "year": 0,
                    "trackCount": item.get("nb_tracks") or 0,
                    "coverUrl": cov,
                    "source": "deezer",
                    "sourceName": "Deezer",
                })
    except Exception as e:
        sys.stderr.write(f"Deezer search error: {e}\n")
    return albums

def get_deezer_album_tracks(album_id):
    clean_id = album_id.replace("dz_alb_", "")
    try:
        url = f"https://api.deezer.com/album/{clean_id}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            root = resp.json()
            cov = root.get("cover_xl") or root.get("cover_big") or root.get("cover_medium") or ""
            artist_name = root.get("artist", {}).get("name") or "Разные исполнители"
            release_date = root.get("release_date") or ""
            year = 0
            if len(release_date) >= 4 and release_date[:4].isdigit():
                year = int(release_date[:4])

            tracks = []
            for t in root.get("tracks", {}).get("data", []):
                t_artist = t.get("artist", {}).get("name") or artist_name
                dur = float(t.get("duration") or 0)
                dur_str = f"{int(dur)//60}:{int(dur)%60:02d}"
                tid = str(t.get("id"))
                preview = t.get("preview") or ""
                stream_url = f"/api/online/stream-deezer?id={tid}&title={requests.utils.quote(t.get('title') or '')}&artist={requests.utils.quote(t_artist)}"
                if preview:
                    stream_url += f"&preview={requests.utils.quote(preview)}"

                tracks.append({
                    "id": f"dz_{tid}",
                    "title": t.get("title") or "Без названия",
                    "artist": t_artist,
                    "album": root.get("title") or "",
                    "year": year,
                    "duration": dur,
                    "durStr": dur_str,
                    "coverUrl": cov,
                    "audioUrl": preview or stream_url,
                    "streamUrl": stream_url,
                    "source": "deezer",
                    "sourceName": "Deezer",
                })

            return {
                "id": f"dz_alb_{root.get('id')}",
                "title": root.get("title") or "Альбом",
                "artist": artist_name,
                "year": year,
                "trackCount": root.get("nb_tracks") or len(tracks),
                "coverUrl": cov,
                "source": "deezer",
                "sourceName": "Deezer",
                "tracks": tracks,
            }
    except Exception as e:
        sys.stderr.write(f"Deezer get album error: {e}\n")
    return None

def search_yandex_albums(query, token):
    albums = []
    if not token:
        return albums
    try:
        from yandex_music import Client
        client = Client(token).init()
        res = client.search(query, type_="album")
        if res and res.albums and res.albums.results:
            for alb in res.albums.results:
                artists = [a.name for a in (alb.artists or []) if hasattr(a, "name") and a.name]
                artist_name = ", ".join(artists) if artists else "Разные исполнители"
                cov = ""
                if getattr(alb, "cover_uri", None):
                    cov = f"https://{alb.cover_uri.replace('%%', '400x400')}"

                albums.append({
                    "id": f"ya_alb_{alb.id}",
                    "title": alb.title or "Без названия",
                    "artist": artist_name,
                    "year": getattr(alb, "year", 0) or 0,
                    "trackCount": getattr(alb, "track_count", 0) or 0,
                    "coverUrl": cov,
                    "source": "yandex",
                    "sourceName": "Яндекс Музыка",
                })
    except Exception as e:
        sys.stderr.write(f"Yandex search error: {e}\n")
    return albums

def get_yandex_album_tracks(album_id, token):
    if not token:
        return None
    clean_id = album_id.replace("ya_alb_", "")
    try:
        from yandex_music import Client
        client = Client(token).init()
        alb = client.albums_with_tracks(clean_id)
        if not alb:
            return None

        artists = [a.name for a in (alb.artists or []) if hasattr(a, "name") and a.name]
        artist_name = ", ".join(artists) if artists else "Разные исполнители"
        cov = ""
        if getattr(alb, "cover_uri", None):
            cov = f"https://{alb.cover_uri.replace('%%', '400x400')}"

        tracks = []
        for volume in (getattr(alb, "volumes", []) or []):
            for t in volume:
                t_artists = [a.name for a in (t.artists or []) if hasattr(a, "name") and a.name]
                t_artist = ", ".join(t_artists) if t_artists else artist_name
                dur = float((t.duration_ms or 0) / 1000.0)
                dur_str = f"{int(dur)//60}:{int(dur)%60:02d}"
                tid = str(t.id)

                t_title = t.title or "Без названия"
                if getattr(t, "version", None):
                    t_title = f"{t_title} ({t.version})"

                t_cov = cov
                if getattr(t, "cover_uri", None):
                    t_cov = f"https://{t.cover_uri.replace('%%', '400x400')}"

                tracks.append({
                    "id": f"ya_{tid}",
                    "title": t_title,
                    "artist": t_artist,
                    "album": alb.title or "",
                    "year": getattr(alb, "year", 0) or 0,
                    "duration": dur,
                    "durStr": dur_str,
                    "coverUrl": t_cov,
                    "audioUrl": f"yandex://{tid}",
                    "streamUrl": f"/api/online/stream-yandex?id={tid}",
                    "source": "yandex",
                    "sourceName": "Яндекс Музыка",
                    "version": getattr(t, "version", "") or "",
                })

        return {
            "id": f"ya_alb_{alb.id}",
            "title": alb.title or "Альбом",
            "artist": artist_name,
            "year": getattr(alb, "year", 0) or 0,
            "trackCount": getattr(alb, "track_count", 0) or len(tracks),
            "coverUrl": cov,
            "source": "yandex",
            "sourceName": "Яндекс Музыка",
            "tracks": tracks,
        }
    except Exception as e:
        sys.stderr.write(f"Yandex get album error: {e}\n")
    return None

def search_audius_albums(query):
    albums = []
    try:
        url = f"https://discoveryprovider.audius.co/v1/playlists/search?query={requests.utils.quote(query)}&app_name=FreeToPlayer"
        resp = requests.get(url, headers=HEADERS, timeout=8)
        if resp.status_code == 200:
            for item in resp.json().get("data", []):
                artwork = item.get("artwork") or {}
                cov = artwork.get("480x480") or artwork.get("1000x1000") or artwork.get("150x150") or ""
                artist = item.get("user", {}).get("name") or "Audius Creator"
                albums.append({
                    "id": f"aud_alb_{item.get('id')}",
                    "title": item.get("playlist_name") or "Audius Playlist",
                    "artist": artist,
                    "year": 0,
                    "trackCount": item.get("track_count") or 0,
                    "coverUrl": cov,
                    "source": "audius",
                    "sourceName": "Audius",
                })
    except Exception as e:
        sys.stderr.write(f"Audius search error: {e}\n")
    return albums

def get_audius_album_tracks(album_id):
    clean_id = album_id.replace("aud_alb_", "")
    try:
        url = f"https://discoveryprovider.audius.co/v1/playlists/{clean_id}/tracks?app_name=FreeToPlayer"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            tracks = []
            alb_cov = ""
            alb_artist = "Audius"
            for t in data:
                tid = str(t.get("id"))
                artwork = t.get("artwork") or {}
                cov = artwork.get("480x480") or artwork.get("1000x1000") or artwork.get("150x150") or ""
                if not alb_cov and cov:
                    alb_cov = cov
                t_artist = t.get("user", {}).get("name") or "Audius Artist"
                if alb_artist == "Audius" and t_artist != "Audius Artist":
                    alb_artist = t_artist
                dur = float(t.get("duration") or 0)
                dur_str = f"{int(dur)//60}:{int(dur)%60:02d}"
                stream_raw = f"https://discoveryprovider.audius.co/v1/tracks/{tid}/stream?app_name=FreeToPlayer"
                stream_proxy = f"/api/online/stream?url={requests.utils.quote(stream_raw)}"

                tracks.append({
                    "id": f"aud_{tid}",
                    "title": t.get("title") or "Без названия",
                    "artist": t_artist,
                    "album": "Audius Playlist",
                    "year": 0,
                    "duration": dur,
                    "durStr": dur_str,
                    "coverUrl": cov,
                    "audioUrl": stream_raw,
                    "streamUrl": stream_proxy,
                    "source": "audius",
                    "sourceName": "Audius",
                })

            return {
                "id": album_id,
                "title": "Audius Playlist",
                "artist": alb_artist,
                "year": 0,
                "trackCount": len(tracks),
                "coverUrl": alb_cov,
                "source": "audius",
                "sourceName": "Audius",
                "tracks": tracks,
            }
    except Exception as e:
        sys.stderr.write(f"Audius get album error: {e}\n")
    return None

def search_deezer_tracks(query):
    tracks = []
    try:
        url = f"https://api.deezer.com/search?q={requests.utils.quote(query)}&limit=100"
        resp = requests.get(url, headers=HEADERS, timeout=8)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            for item in data:
                album = item.get("album", {})
                cov = album.get("cover_xl") or album.get("cover_big") or album.get("cover_medium") or ""
                artist_name = item.get("artist", {}).get("name") or "Разные исполнители"
                dur = float(item.get("duration") or 0)
                dur_str = f"{int(dur)//60}:{int(dur)%60:02d}"
                tid = str(item.get("id"))
                preview = item.get("preview") or ""
                stream_url = f"/api/online/stream-deezer?id={tid}&title={requests.utils.quote(item.get('title') or '')}&artist={requests.utils.quote(artist_name)}"
                if preview:
                    stream_url += f"&preview={requests.utils.quote(preview)}"

                tracks.append({
                    "id": f"dz_{tid}",
                    "title": item.get("title") or "Без названия",
                    "artist": artist_name,
                    "album": album.get("title") or "",
                    "year": 0,
                    "duration": dur,
                    "durStr": dur_str,
                    "coverUrl": cov,
                    "audioUrl": preview or stream_url,
                    "streamUrl": stream_url,
                    "source": "deezer",
                    "sourceName": "Deezer",
                })
    except Exception as e:
        sys.stderr.write(f"Deezer track search error: {e}\n")
    return tracks

def get_artist_photo(artist_name):
    try:
        url = f"https://api.deezer.com/search/artist?q={requests.utils.quote(artist_name)}&limit=1"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            if data:
                a = data[0]
                return a.get("picture_xl") or a.get("picture_big") or a.get("picture_medium") or ""
    except Exception as e:
        sys.stderr.write(f"Deezer artist photo error: {e}\n")
    return ""

def main():
    if len(sys.argv) < 3:
        print("[]")
        return

    action = sys.argv[1]
    arg1 = sys.argv[2]
    arg2 = sys.argv[3] if len(sys.argv) > 3 else ""

    if action == "search_deezer_tracks":
        res = search_deezer_tracks(arg1)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "search_deezer":
        res = search_deezer_albums(arg1)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "get_deezer":
        res = get_deezer_album_tracks(arg1)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "search_yandex":
        res = search_yandex_albums(arg1, arg2)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "get_yandex":
        res = get_yandex_album_tracks(arg1, arg2)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "search_audius":
        res = search_audius_albums(arg1)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "get_audius":
        res = get_audius_album_tracks(arg1)
        print(json.dumps(res, ensure_ascii=False))
    elif action == "get_artist_photo":
        res = get_artist_photo(arg1)
        print(json.dumps({"photo": res}, ensure_ascii=False))
    else:
        print("[]")

if __name__ == "__main__":
    main()
