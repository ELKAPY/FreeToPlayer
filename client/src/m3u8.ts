import type { Track } from './types';

export async function exportPlaylistToM3U8(tracks: Track[], filename = 'my_collection.m3u8'): Promise<string | null> {
  let content = '#EXTM3U\n';
  for (const t of tracks) {
    const dur = Math.round(t.duration || 0);
    content += `#EXTINF:${dur},${t.artist} - ${t.title}\n`;
    content += `${t.filename}\n`;
  }

  // 1. Send to server to save directly in Windows Downloads folder
  try {
    const res = await fetch('/api/export-m3u8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.path) {
        return data.path;
      }
    }
  } catch (e) {}

  // 2. Also trigger standard browser download fallback
  const blob = new Blob([content], { type: 'audio/x-mpegurl;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.m3u8') ? filename : `${filename}.m3u8`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return null;
}

export function parseM3U8(content: string): string[] {
  const lines = content.split('\n');
  const filenames: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    filenames.push(trimmed);
  }

  return filenames;
}
