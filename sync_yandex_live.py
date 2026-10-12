import json
import os
import sys
import time
from pathlib import Path
import re
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from yandex_music import Client

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "audio"
COVERS_DIR = DATA_DIR / "covers"
LIBRARY_FILE = DATA_DIR / "library.json"
STATUS_FILE = DATA_DIR / "yandex_sync_status.json"
DELETED_FILE = DATA_DIR / "deleted_tracks.json"
TOKEN_FILE = BASE_DIR / "yandex_token.txt"

AUDIO_DIR.mkdir(parents=True, exist_ok=True)
COVERS_DIR.mkdir(parents=True, exist_ok=True)

def update_status(status, message, current=0, total=0, track_progress=0, track_title="", done=False, error=None):
    data = {
        "status": status,
        "message": message,
        "current": current,
        "total": total,
        "track_progress": track_progress,
        "track_title": track_title,
        "done": done,
        "error": error,
        "timestamp": time.time()
    }
    try:
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

def clean_name(s):
    return re.sub(r'[\\/*?:"<>|]', "", str(s or "")).strip()

def load_deleted():
    if DELETED_FILE.exists():
        try:
            with open(DELETED_FILE, "r", encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            return set()
    return set()

def main():
    try:
        from yandex_music import Client
    except ImportError:
        update_status("installing", "Установка библиотеки yandex-music...")
        import subprocess
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "yandex-music", "requests"])
            from yandex_music import Client
        except Exception as install_err:
            update_status("error", f"Требуется установить yandex-music: pip install yandex-music ({install_err})", done=True, error=str(install_err))
            return

    token_path = TOKEN_FILE
    if not token_path.exists() and (DATA_DIR / "yandex_token.txt").exists():
        token_path = DATA_DIR / "yandex_token.txt"

    if not token_path.exists():
        update_status("error", "Файл yandex_token.txt не найден. Выполните вход в настройках приложения.", done=True, error="No token file")
        return

    token = token_path.read_text(encoding="utf-8").strip()
    if not token:
        update_status("error", "Токен Яндекс Музыки пуст", done=True, error="Empty token")
        return

    update_status("connecting", "Подключение к Яндекс Музыке...")

    try:
        client = Client(token).init()
        disp = getattr(getattr(client.me, "account", None), "display_name", "User")
        print(f"Connected as {disp}")
    except Exception as e:
        update_status("error", f"Ошибка авторизации: {e}", done=True, error=str(e))
        return

    update_status("fetching", "Получение ваших плейлистов и треков...")

    # Load local library
    existing_ids = set()
    library = []
    if LIBRARY_FILE.exists():
        try:
            with open(LIBRARY_FILE, "r", encoding="utf-8") as f:
                library = json.load(f)
                existing_ids = {str(t.get("id")) for t in library}
        except Exception:
            library = []

    deleted_ids = load_deleted()

    # Fetch ONLY liked tracks ("Мне нравится" / "Любимое")
    all_remote_tracks = {}
    liked_ids_set = set()
    try:
        likes = client.users_likes_tracks()
        if likes:
            full_likes = likes.fetch_tracks()
            for t in full_likes:
                if t and str(t.id) not in deleted_ids:
                    all_remote_tracks[str(t.id)] = (t, "Любимое")
                    liked_ids_set.add(str(t.id))
    except Exception as e:
        update_status("error", f"Ошибка получения плейлиста «Любимое»: {e}", done=True, error=str(e))
        return

    # Sync with local liked tracks file
    liked_file = DATA_DIR / "liked_tracks.json"
    try:
        existing_liked = set()
        if liked_file.exists():
            with open(liked_file, "r", encoding="utf-8") as f:
                existing_liked = set(json.load(f))
        combined_liked = list(existing_liked.union(liked_ids_set))
        with open(liked_file, "w", encoding="utf-8") as f:
            json.dump(combined_liked, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    # Filter out tracks that are already downloaded
    new_tracks_to_download = []
    for tid, (track_obj, p_name) in all_remote_tracks.items():
        target_mp3 = AUDIO_DIR / f"{tid}.mp3"
        if tid not in existing_ids or not target_mp3.exists() or target_mp3.stat().st_size < 1000:
            new_tracks_to_download.append((track_obj, p_name))

    total_new = len(new_tracks_to_download)
    print(f"Total remote tracks: {len(all_remote_tracks)}. New to download: {total_new}")

    if total_new == 0:
        update_status("completed", "Все треки уже синхронизированы! Медиатека актуальна.", current=0, total=0, done=True)
        return

    update_status("downloading", f"Скачивание новых треков (0 из {total_new})...", current=0, total=total_new)

    downloaded_count = 0
    lock = threading.Lock()

    def download_one(item, idx):
        nonlocal downloaded_count
        track, playlist_name = item
        tid = str(track.id)
        artist_name = ", ".join([a.name for a in track.artists if a.name]) if track.artists else "Unknown Artist"
        title_name = track.title or "Unknown Track"
        album_name = track.albums[0].title if track.albums else "Single"
        year = track.albums[0].year if track.albums and track.albums[0].year else 0
        duration_sec = (track.duration_ms or 0) / 1000.0

        target_mp3 = AUDIO_DIR / f"{tid}.mp3"
        target_cover = COVERS_DIR / f"{tid}.jpg"
        has_cover = False

        # Download cover art
        if track.cover_uri:
            cover_url = "https://" + track.cover_uri.replace("%%", "600x600")
            try:
                r = requests.get(cover_url, timeout=10)
                if r.status_code == 200 and len(r.content) > 500:
                    with open(target_cover, "wb") as f:
                        f.write(r.content)
                    has_cover = True
            except Exception:
                pass

        # Download audio stream with progress reporting
        def download_with_progress():
            try:
                # Try getting download info URL first to stream with progress
                dl_info = track.get_download_info()
                best = None
                for info in dl_info:
                    if info.codec == 'mp3':
                        best = info
                        if info.bitrate_in_kbps == 320:
                            break
                if not best and dl_info:
                    best = dl_info[0]

                if best and hasattr(best, 'get_direct_link'):
                    direct_url = best.get_direct_link()
                    if direct_url:
                        with requests.get(direct_url, stream=True, timeout=20) as resp:
                            if resp.status_code == 200:
                                total_bytes = int(resp.headers.get('content-length', 0))
                                dl_bytes = 0
                                with open(target_mp3, 'wb') as audio_out:
                                    for chunk in resp.iter_content(chunk_size=32768):
                                        if chunk:
                                            audio_out.write(chunk)
                                            dl_bytes += len(chunk)
                                            if total_bytes > 0:
                                                pct = int((dl_bytes / total_bytes) * 100)
                                                update_status(
                                                    "downloading",
                                                    f"Скачивание ({i+1}/{total_new}): {clean_name(artist_name)} — {clean_name(title_name)}",
                                                    current=downloaded_count,
                                                    total=total_new,
                                                    track_progress=pct,
                                                    track_title=f"{artist_name} — {title_name}"
                                                )
                                return True
            except Exception as e_stream:
                print(f"Direct stream failed for {title_name}, falling back to default download: {e_stream}")

            try:
                track.download(str(target_mp3), codec="mp3", bitrate_in_kbps=320)
                return True
            except Exception:
                try:
                    track.download(str(target_mp3))
                    return True
                except Exception as e2:
                    print(f"Failed to download {artist_name} - {title_name}: {e2}")
                    return False

        if not download_with_progress():
            return False

        file_size = target_mp3.stat().st_size if target_mp3.exists() else 0
        if file_size < 1000:
            return False

        new_entry = {
            "id": tid,
            "title": title_name,
            "artist": artist_name,
            "album": album_name,
            "year": year,
            "duration": round(duration_sec, 1),
            "format": "MP3",
            "isLossless": False,
            "fileSize": file_size,
            "hasCover": has_cover,
            "coverExt": "jpg" if has_cover else "",
            "filename": f"{tid}.mp3",
            "originalName": f"{clean_name(artist_name)} - {clean_name(title_name)}.mp3",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S+03:00")
        }

        with lock:
            library.append(new_entry)
            downloaded_count += 1
            # Save progress periodically
            with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump(library, f, ensure_ascii=False, indent=2)

            update_status(
                "downloading",
                f"Скачивание: {clean_name(artist_name)} - {clean_name(title_name)} ({downloaded_count}/{total_new})",
                current=downloaded_count,
                total=total_new
            )

        return True

    with ThreadPoolExecutor(max_workers=1) as executor:
        futures = [executor.submit(download_one, item, i) for i, item in enumerate(new_tracks_to_download)]
        for f in as_completed(futures):
            f.result()

    update_status("completed", f"Синхронизация завершена! Добавлено {downloaded_count} новых треков.", current=downloaded_count, total=total_new, done=True)
    print("Sync finished successfully.")

if __name__ == "__main__":
    main()
