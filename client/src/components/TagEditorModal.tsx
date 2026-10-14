import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Edit3, Save, X, Image as ImageIcon, Search, Upload, Check, Loader2 } from 'lucide-react';
import type { Track } from '../types';
import { getTrackCoverSrc, searchCovers, setTrackCover, type CoverCandidate } from '../api';

interface TagEditorModalProps {
  track: Track | null;
  onClose: () => void;
  onSave: (id: string, data: { title: string; artist: string; album: string; year?: number; genre?: string }) => Promise<void>;
  onCoverUpdated?: (updatedTrack: Track) => void;
}

export const TagEditorModal: React.FC<TagEditorModalProps> = ({
  track,
  onClose,
  onSave,
  onCoverUpdated,
}) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(track);
  const [title, setTitle] = useState(track?.title || '');
  const [artist, setArtist] = useState(track?.artist || '');
  const [album, setAlbum] = useState(track?.album || '');
  const [year, setYear] = useState<string>(track?.year && track.year > 0 ? String(track.year) : '');
  const [genre, setGenre] = useState<string>(track?.genre || '');
  const [isSaving, setIsSaving] = useState(false);

  // Cover management state
  const [isSearchingCovers, setIsSearchingCovers] = useState(false);
  const [coverCandidates, setCoverCandidates] = useState<CoverCandidate[]>([]);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [isSettingCover, setIsSettingCover] = useState(false);
  const [coverMessage, setCoverMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!track || !currentTrack) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) return;
    setIsSaving(true);
    const parsedYear = parseInt(year.trim(), 10);
    try {
      await onSave(currentTrack.id, {
        title: title.trim(),
        artist: artist.trim(),
        album: album.trim(),
        year: !isNaN(parsedYear) && parsedYear > 0 ? parsedYear : undefined,
        genre: genre.trim() || undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearchOnlineCovers = async () => {
    setIsSearchingCovers(true);
    setShowCoverPicker(true);
    setCoverMessage(null);
    try {
      const q = `${artist.trim()} ${title.trim()}`.trim();
      const list = await searchCovers(currentTrack.id, q);
      setCoverCandidates(list);
      if (list.length === 0) {
        setCoverMessage('Обложки не найдены. Попробуйте изменить название или загрузить файл.');
      }
    } catch (e) {
      setCoverMessage('Ошибка при поиске обложек.');
    } finally {
      setIsSearchingCovers(false);
    }
  };

  const handleSelectCover = async (candidate: CoverCandidate) => {
    setIsSettingCover(true);
    try {
      const updated = await setTrackCover(currentTrack.id, { coverUrl: candidate.url });
      if (updated) {
        const enriched: Track = { ...updated, coverUpdatedAt: Date.now() };
        setCurrentTrack(enriched);
        setShowCoverPicker(false);
        setCoverMessage('Обложка успешно установлена!');
        if (onCoverUpdated) onCoverUpdated(enriched);
      }
    } catch (e) {
      setCoverMessage('Не удалось установить обложку.');
    } finally {
      setIsSettingCover(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      if (!base64) return;
      setIsSettingCover(true);
      try {
        const updated = await setTrackCover(currentTrack.id, { coverBase64: base64 });
        if (updated) {
          const enriched: Track = { ...updated, coverUpdatedAt: Date.now() };
          setCurrentTrack(enriched);
          setShowCoverPicker(false);
          setCoverMessage('Обложка загружена из файла!');
          if (onCoverUpdated) onCoverUpdated(enriched);
        }
      } catch (err) {
        setCoverMessage('Ошибка загрузки обложки.');
      } finally {
        setIsSettingCover(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const coverSrc = getTrackCoverSrc(currentTrack);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 select-none animate-fade-in">
      <div className="w-full max-w-lg rounded-2xl bg-[#090a0f] border border-white/[0.1] p-6 shadow-2xl flex flex-col gap-4 animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-white font-bold text-base">
            <Edit3 className="w-4 h-4 text-cyan-400" />
            <span>Редактировать трек и обложку</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cover Art Section */}
        <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 shadow-md">
            {coverSrc ? (
              <img
                src={coverSrc}
                alt="Track cover"
                key={currentTrack.coverUpdatedAt || 1}
                className="w-full h-full object-cover"
              />
            ) : (
              <ImageIcon className="w-8 h-8 text-slate-600" />
            )}
          </div>

          <div className="flex flex-col gap-2 flex-1 w-full">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Обложка альбома</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-400">
                {currentTrack.hasCover ? 'Установлена' : 'Отсутствует'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleSearchOnlineCovers}
                disabled={isSearchingCovers || isSettingCover}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
              >
                {isSearchingCovers ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>Найти в сети</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSettingCover}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium bg-white/[0.06] text-slate-300 border border-white/[0.1] hover:bg-white/[0.1] transition-all cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <Upload className="w-4 h-4" />
                <span>Загрузить файл</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>

            {coverMessage && (
              <span className="text-[11px] text-cyan-400 font-mono mt-0.5">{coverMessage}</span>
            )}
          </div>
        </div>

        {/* Online Cover Picker Gallery */}
        {showCoverPicker && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Выберите обложку из результатов поиска ({coverCandidates.length}):
              </span>
              <button
                type="button"
                onClick={() => setShowCoverPicker(false)}
                className="text-xs text-slate-500 hover:text-white cursor-pointer"
              >
                Скрыть
              </button>
            </div>

            {isSearchingCovers ? (
              <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                <span className="text-xs font-mono">Поиск в Deezer (1000x1000), SoundCloud, Яндекс...</span>
              </div>
            ) : coverCandidates.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {coverCandidates.map((cand, idx) => (
                  <button
                    key={`${cand.url}_${idx}`}
                    type="button"
                    onClick={() => handleSelectCover(cand)}
                    disabled={isSettingCover}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-white/[0.1] hover:border-cyan-400 transition-all cursor-pointer bg-black/40 text-left"
                    title={`${cand.artist} - ${cand.title} (${cand.sourceName})`}
                  >
                    <img
                      src={cand.url}
                      alt={cand.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Check className="w-5 h-5 text-cyan-400" />
                    </div>
                    <span className="absolute bottom-1 left-1 right-1 text-[9px] font-mono px-1 py-0.5 bg-black/70 backdrop-blur-xs text-slate-300 rounded truncate">
                      {cand.sourceName}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-500">
                Обложки не найдены по текущему запросу.
              </div>
            )}
          </div>
        )}

        {/* Metadata Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] font-mono text-slate-400 mb-1 block">Название трека</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-cyan-500/60"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 mb-1 block">Исполнитель / Группа</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-cyan-500/60"
              required
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 mb-1 block">Альбом</label>
            <input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-cyan-500/60"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 mb-1 block">Год выпуска</label>
            <input
              type="number"
              min="1900"
              max="2099"
              placeholder="например, 2024"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white font-mono focus:outline-none focus:border-cyan-500/60"
            />
          </div>

          <div>
            <label className="text-[11px] font-mono text-slate-400 mb-1 block">Жанр</label>
            <input
              type="text"
              placeholder="например, Rock, Hip-Hop, Electronic, Jazz"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white focus:outline-none focus:border-cyan-500/60"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={onClose}
              className="px-4.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer active:scale-95"
            >
              Закрыть
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-all cursor-pointer shadow-md disabled:opacity-50 active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Сохранение...' : 'Сохранить теги'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
