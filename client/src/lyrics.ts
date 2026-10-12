export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  synced: LyricLine[] | null;
  plain: string | null;
}

const lyricsCache = new Map<string, LyricsData>();

export function clearLyricsCache(): void {
  lyricsCache.clear();
}

export function getLyricsCacheSize(): number {
  return lyricsCache.size;
}

export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split('\n');
  const result: LyricLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\](.*)/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const text = match[3].trim();
      const time = minutes * 60 + seconds;
      if (text) {
        result.push({ time, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(
  rawArtist: string,
  rawTitle: string,
  duration?: number
): Promise<LyricsData | null> {
  const cacheKey = `${rawArtist.toLowerCase()}_${rawTitle.toLowerCase()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey)!;
  }

  // Smart cleaning: handle "Artist - Title", "User ...", parentheses, feat.
  let artist = (rawArtist || '').trim();
  let title = (rawTitle || '').trim();

  const isUserArtist = /^user[\s_-]*\d*$/i.test(artist) || /^(unknown|неизвестный)/i.test(artist);
  if ((isUserArtist || !artist) && title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts[0].trim() && !/^user[\s_-]*\d*$/i.test(parts[0].trim())) {
      artist = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    } else {
      artist = '';
    }
  }

  const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, '').trim();
  const cleanArtist = artist.split(',')[0].split('&')[0].trim();

  // 1. Try Backend Proxy (/api/lyrics) which bypasses browser Cloudflare/CORS restrictions
  try {
    const backendParams = new URLSearchParams({
      artist: cleanArtist,
      title: cleanTitle || title,
    });
    if (duration && duration > 0) {
      backendParams.append('duration', Math.round(duration).toString());
    }

    const backendRes = await fetch(`/api/lyrics?${backendParams.toString()}`);
    if (backendRes.ok) {
      const data = await backendRes.json();
      let synced: LyricLine[] | null = null;
      let plain: string | null = null;

      if (data.syncedLyrics) {
        synced = parseLrc(data.syncedLyrics);
      }
      if (data.plainLyrics) {
        plain = data.plainLyrics;
      }

      if (synced || plain) {
        const result: LyricsData = { synced, plain };
        lyricsCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (e) {
    // Backend fetch failed, fall through to direct LRCLIB search
  }

  // 2. Direct LRCLIB fallback with multi-tier searches
  try {
    const searchQueries: string[] = [];
    if (cleanArtist && cleanTitle) {
      searchQueries.push(`${cleanArtist} ${cleanTitle}`);
    }
    if (cleanTitle) {
      searchQueries.push(cleanTitle);
    }

    for (const q of searchQueries) {
      try {
        const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) continue;

        const items = await res.json();
        if (!Array.isArray(items) || items.length === 0) continue;

        // Prefer item with synced lyrics
        const best = items.find((it: any) => it.syncedLyrics) || items.find((it: any) => it.plainLyrics);
        if (best) {
          const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : null;
          const plain = best.plainLyrics || null;
          if (synced || plain) {
            const result: LyricsData = { synced, plain };
            lyricsCache.set(cacheKey, result);
            return result;
          }
        }
      } catch (err) {
        // Continue to next query
      }
    }

    return null;
  } catch (err) {
    console.warn('Failed to fetch lyrics:', err);
    return null;
  }
}
