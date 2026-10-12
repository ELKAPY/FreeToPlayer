import json
import os
import sys
import time
from pathlib import Path
import re
import requests

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "audio"
COVERS_DIR = DATA_DIR / "covers"
LIBRARY_FILE = DATA_DIR / "library.json"
STATUS_FILE = DATA_DIR / "youtube_sync_status.json"
CONFIG_FILE = DATA_DIR / "youtube_config.json"
DELETED_FILE = DATA_DIR / "deleted_tracks.json"
COOKIES_FILE = BASE_DIR / "youtube_cookies.txt"
LIKED_FILE = DATA_DIR / "liked_tracks.json"

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

def get_playlist_url():
    # 1. Check data/youtube_config.json
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                url = cfg.get("playlist_url", "").strip()
                if url:
                    return url
        except Exception:
            pass
    # 2. Check root youtube_playlist.txt
    p_file = BASE_DIR / "youtube_playlist.txt"
    if p_file.exists():
        try:
            url = p_file.read_text(encoding="utf-8").strip()
            if url:
                return url
        except Exception:
            pass
    # Default to Liked Music playlist
    return "https://music.youtube.com/playlist?list=LM"

def main():
    try:
        import yt_dlp
    except ImportError:
        update_status("installing", "Установка модуля yt-dlp...")
        import subprocess
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp", "requests"])
            import yt_dlp
        except Exception as install_err:
            update_status("error", f"Требуется установить yt-dlp: pip install yt-dlp ({install_err})", done=True, error=str(install_err))
            return

    playlist_url = get_playlist_url()
    if not playlist_url:
        update_status("error", "Укажите ссылку на плейлист YouTube Music в настройках", done=True, error="No playlist URL specified")
        return

    update_status("connecting", "Подключение к YouTube Music...")

    cookie_path = None
    if COOKIES_FILE.exists() and COOKIES_FILE.stat().st_size > 50:
        cookie_path = str(COOKIES_FILE.resolve())
    elif (DATA_DIR / "youtube_cookies.txt").exists() and (DATA_DIR / "youtube_cookies.txt").stat().st_size > 50:
        cookie_path = str((DATA_DIR / "youtube_cookies.txt").resolve())

    # 1. Fetch playlist metadata & entries (fast flat extract)
    update_status("fetching", "Получение списка треков плейлиста...")

    flat_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "skip_download": True,
    }
    if cookie_path:
        flat_opts["cookiefile"] = cookie_path

    playlist_title = "YouTube Music"
    entries = []

    try:
        with yt_dlp.YoutubeDL(flat_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=False)
            if not info:
                update_status("error", "Не удалось прочитать плейлист (проверьте ссылку или доступность)", done=True, error="Empty playlist info")
                return
            playlist_title = info.get("title") or "YouTube Music"
            entries = info.get("entries") or []
    except Exception as e:
        err_msg = str(e)
        if "Private video" in err_msg or "Sign in" in err_msg or "login" in err_msg.lower():
            err_msg = "Плейлист закрыт. Добавьте youtube_cookies.txt в папку приложения или откройте доступ по ссылке."
        update_status("error", f"Ошибка получения плейлиста: {err_msg}", done=True, error=str(e))
        return

    if not entries:
        update_status("done", "В плейлисте нет треков для загрузки", done=True)
        return

    # Load local library & deleted blacklist
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

    # Filter out already existing or blacklisted tracks
    tracks_to_process = []
    new_liked_ids = set()

    for item in entries:
        if not item:
            continue
        vid = item.get("id") or item.get("url")
        if not vid:
            continue
        vid = str(vid)
        # Normalize clean ID
        if "watch?v=" in vid:
            vid = vid.split("watch?v=")[1].split("&")[0]

        track_id = f"yt-{vid}"
        if track_id in deleted_ids:
            continue

        new_liked_ids.add(track_id)

        target_file = AUDIO_DIR / f"{track_id}.mp3"
        if track_id not in existing_ids or not target_file.exists() or target_file.stat().st_size < 1000:
            tracks_to_process.append((track_id, vid, item))

    # Sync with liked_tracks.json
    try:
        existing_liked = set()
        if LIKED_FILE.exists():
            with open(LIKED_FILE, "r", encoding="utf-8") as f:
                existing_liked = set(json.load(f))
        combined_liked = list(existing_liked.union(new_liked_ids))
        with open(LIKED_FILE, "w", encoding="utf-8") as f:
            json.dump(combined_liked, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

    total_count = len(tracks_to_process)
    if total_count == 0:
        update_status("done", f"Все треки из «{playlist_title}» уже синхронизированы ({len(entries)} шт.)", done=True)
        return

    update_status("downloading", f"Найдено {total_count} новых треков для синхронизации...", current=0, total=total_count)

    downloaded_count = 0
    errors_count = 0

    for idx, (track_id, vid, meta) in enumerate(tracks_to_process, 1):
        raw_title = meta.get("title") or "Unknown Title"
        artist = meta.get("uploader") or meta.get("channel") or meta.get("artist") or "YouTube Music"

        # Split "Artist - Title" if title contains hyphen
        title = raw_title
        if " - " in raw_title and ("YouTube" in artist or not artist or artist == "Various Artists"):
            parts = raw_title.split(" - ", 1)
            artist = parts[0].strip()
            title = parts[1].strip()

        # Clean noise tags like (Official Video), [Audio]
        title = re.sub(r'(?i)\s*[\(\[](official\s*(music\s*)?(video|audio)|lyric\s*video|audio|hd|4k|visualizer)[\)\]]', '', title).strip()

        duration = float(meta.get("duration") or 0)
        thumbnail = meta.get("thumbnail") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"

        update_status(
            "downloading",
            f"Загрузка ({idx}/{total_count}): {artist} — {title}",
            current=idx,
            total=total_count
        )

        target_mp3 = AUDIO_DIR / f"{track_id}.mp3"
        temp_dest = AUDIO_DIR / f"{track_id}_temp.mp3"

        # Download audio via yt_dlp
        def dl_progress_hook(d):
            if d.get('status') == 'downloading':
                total_b = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded_b = d.get('downloaded_bytes') or 0
                pct = int((downloaded_b / total_b * 100)) if total_b > 0 else 0
                update_status(
                    "downloading",
                    f"Загрузка ({idx}/{total_count}): {artist} — {title}",
                    current=idx,
                    total=total_count,
                    track_progress=pct,
                    track_title=f"{artist} — {title}"
                )

        dl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(temp_dest),
            "quiet": True,
            "no_warnings": True,
            "nocheckcertificate": True,
            "progress_hooks": [dl_progress_hook],
        }
        if cookie_path:
            dl_opts["cookiefile"] = cookie_path

        dl_success = False
        try:
            with yt_dlp.YoutubeDL(dl_opts) as ydl:
                ydl.download([f"https://www.youtube.com/watch?v={vid}"])
            if temp_dest.exists() and temp_dest.stat().st_size > 1000:
                if target_mp3.exists():
                    try:
                        target_mp3.unlink()
                    except Exception:
                        pass
                temp_dest.rename(target_mp3)
                dl_success = True
        except Exception as e:
            print(f"Error downloading {vid}: {e}")
            if temp_dest.exists():
                try:
                    temp_dest.unlink()
                except Exception:
                    pass

        if not dl_success:
            errors_count += 1
            continue

        file_size = target_mp3.stat().st_size

        # Download cover
        has_cover = False
        cover_ext = "jpg"
        target_cover = COVERS_DIR / f"{track_id}.jpg"
        if thumbnail:
            try:
                c_resp = requests.get(thumbnail, timeout=6)
                if c_resp.status_code == 200 and len(c_resp.content) > 500:
                    with open(target_cover, "wb") as cf:
                        cf.write(c_resp.content)
                    has_cover = True
            except Exception:
                pass

        # Build library Track model
        track_entry = {
            "id": track_id,
            "title": title,
            "artist": artist,
            "album": playlist_title,
            "year": time.localtime().tm_year,
            "duration": duration,
            "format": "MP3",
            "isLossless": False,
            "fileSize": file_size,
            "hasCover": has_cover,
            "coverExt": cover_ext,
            "filename": f"{track_id}.mp3",
            "originalName": f"{clean_name(artist)} - {clean_name(title)}.mp3",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "source": "youtube"
        }

        library.append(track_entry)
        downloaded_count += 1

        # Save library incrementally after each track
        try:
            with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump(library, f, ensure_ascii=False, indent=2)
        except Exception:
            pass

    msg = f"Синхронизация YouTube Music завершена! Добавлено {downloaded_count} треков"
    if errors_count > 0:
        msg += f" (пропущено {errors_count})"
    update_status("done", msg, current=total_count, total=total_count, done=True)

if __name__ == "__main__":
    main()
