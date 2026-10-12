import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Disc,
  ExternalLink,
  Flame,
  Globe,
  Headphones,
  ListMusic,
  ListPlus,
  Mic,
  Music,
  Palette,
  Play,
  Radio,
  Search,
  Sliders,
  X,
} from 'lucide-react';
import { getCoverUrl } from '../api';
import { getPlaylists, type Playlist } from '../playlists';
import type { SettingsCategory } from '../settings';
import type { Track, ViewTab } from '../types';
import { formatTime } from '../useAudioPlayer';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: Track[];
  onPlayTrack: (track: Track) => void;
  onAddTrackToQueue: (track: Track) => void;
  onNavigateTab: (tab: ViewTab) => void;
  onSelectArtist: (artist: string) => void;
  onSelectPlaylist: (playlist: Playlist) => void;
  onSelectSmartPlaylist: (type: 'most_played' | 'recently_added' | 'forgotten') => void;
  onSearchOnline: (query: string, mode?: 'tracks' | 'albums' | 'radio') => void;
  onOpenSettingsCategory: (cat: SettingsCategory) => void;
  onStartArtistFlow: (artist: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  tracks,
  onPlayTrack,
  onAddTrackToQueue,
  onNavigateTab,
  onSelectArtist,
  onSelectPlaylist,
  onSelectSmartPlaylist,
  onSearchOnline,
  onOpenSettingsCategory,
  onStartArtistFlow,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => getPlaylists());

  useEffect(() => {
    if (isOpen) {
      setPlaylists(getPlaylists());
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Key navigation (Esc to close)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const cleanQ = query.trim().toLowerCase();

  // 1. Matched Tracks (up to 6)
  const matchedTracks = useMemo(() => {
    if (!cleanQ) return [];
    return tracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(cleanQ) ||
          t.artist.toLowerCase().includes(cleanQ) ||
          (t.album && t.album.toLowerCase().includes(cleanQ))
      )
      .slice(0, 6);
  }, [tracks, cleanQ]);

  // 2. Matched Artists (distinct)
  const matchedArtists = useMemo(() => {
    if (!cleanQ) return [];
    const map = new Map<string, number>();
    for (const t of tracks) {
      const art = t.artist || 'Unknown Artist';
      if (art.toLowerCase().includes(cleanQ)) {
        map.set(art, (map.get(art) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [tracks, cleanQ]);

  // 3. Matched Playlists
  const matchedPlaylists = useMemo(() => {
    if (!cleanQ) return [];
    const results: { id: string; name: string; type: 'custom' | 'smart'; smartKey?: 'most_played' | 'recently_added' | 'forgotten'; count?: number }[] = [];

    // Check smart playlists
    if ('топ прослушиваний'.includes(cleanQ) || 'most played'.includes(cleanQ) || 'популярные'.includes(cleanQ)) {
      results.push({ id: 'smart_most', name: 'Топ прослушиваний', type: 'smart', smartKey: 'most_played' });
    }
    if ('недавно добавленные'.includes(cleanQ) || 'recent'.includes(cleanQ) || 'новинки'.includes(cleanQ)) {
      results.push({ id: 'smart_recent', name: 'Недавно добавленные', type: 'smart', smartKey: 'recently_added' });
    }
    if ('забытые фавориты'.includes(cleanQ) || 'forgotten'.includes(cleanQ)) {
      results.push({ id: 'smart_forgotten', name: 'Забытые фавориты', type: 'smart', smartKey: 'forgotten' });
    }

    // Check custom playlists
    for (const pl of playlists) {
      if (pl.name.toLowerCase().includes(cleanQ)) {
        results.push({ id: pl.id, name: pl.name, type: 'custom', count: pl.trackIds.length });
      }
    }
    return results.slice(0, 4);
  }, [playlists, cleanQ]);

  // 4. Quick settings matches
  const matchedSettings = useMemo(() => {
    if (!cleanQ) return [];
    const settingsList: { id: SettingsCategory; title: string; desc: string; icon: React.ReactNode; keywords: string[] }[] = [
      {
        id: 'audio',
        title: 'Эквалайзер и Звук',
        desc: '10-полосный EQ, пресеты, баланс L/R, кроссфейд, устройства вывода',
        icon: <Headphones className="w-4 h-4 text-purple-400" />,
        keywords: ['эквалайзер', 'eq', 'звук', 'наушники', 'громкость', 'баланс', 'кроссфейд', 'гарнитура', 'цап', 'устройство'],
      },
      {
        id: 'playback',
        title: 'Настройки плеера и таймер сна',
        desc: 'Скорость воспроизведения, шаг перемотки, авто-пауза при звонках, таймер',
        icon: <Clock className="w-4 h-4 text-cyan-400" />,
        keywords: ['таймер', 'сон', 'перемотка', 'шаг', 'скорость', 'плеер', 'пауза', 'звонок', 'очередь'],
      },
      {
        id: 'collection',
        title: 'Медиатека и папка музыки',
        desc: 'Путь к файлам, сортировка, вид по умолчанию, умные плейлисты, экспорт M3U8',
        icon: <ListMusic className="w-4 h-4 text-amber-400" />,
        keywords: ['папка', 'хранение', 'медиатека', 'библиотека', 'диск', 'экспорт', 'm3u8', 'проводник', 'сортировка'],
      },
      {
        id: 'online',
        title: 'Онлайн каталоги, источники и радио',
        desc: 'Источники (Deezer, Яндекс, Hitmo, SoundCloud), живой поиск, радио 40k+',
        icon: <Globe className="w-4 h-4 text-rose-400" />,
        keywords: ['онлайн', 'поиск', 'источник', 'deezer', 'яндекс', 'hitmo', 'soundcloud', 'радио', 'версии'],
      },
      {
        id: 'appearance',
        title: 'Темы, спектроанализатор и караоке',
        desc: 'Палитры (Onyx, Cyberpunk, Dracula), стиль визуализатора, караоке-текст',
        icon: <Palette className="w-4 h-4 text-emerald-400" />,
        keywords: ['тема', 'оформление', 'визуализатор', 'спектр', 'караоке', 'текст', 'слова', 'шрифт', 'цвет'],
      },
      {
        id: 'system',
        title: 'Система, окно и Discord RPC',
        desc: 'Поверх всех окон, мини-плеер, статус в Discord, горячие клавиши',
        icon: <Sliders className="w-4 h-4 text-cyan-400" />,
        keywords: ['окно', 'поверх', 'discord', 'дискорд', 'клавиши', 'хоткеи', 'мини', 'трей'],
      },
    ];

    return settingsList.filter((item) =>
      item.keywords.some((k) => k.includes(cleanQ) || cleanQ.includes(k)) ||
      item.title.toLowerCase().includes(cleanQ) ||
      item.desc.toLowerCase().includes(cleanQ)
    );
  }, [cleanQ]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl bg-[#0b0c13] border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-slide-up"
      >
        {/* Search Input Bar */}
        <div className="p-3.5 sm:p-4 border-b border-white/[0.08] flex items-center gap-3 bg-white/[0.02]">
          <Search className="w-5 h-5 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && cleanQ) {
                if (matchedTracks.length > 0) {
                  onPlayTrack(matchedTracks[0]);
                  onClose();
                } else {
                  onSearchOnline(cleanQ, 'tracks');
                  onClose();
                }
              }
            }}
            placeholder="Быстрый поиск по всей медиатеке, исполнителям, плейлистам, настройкам или онлайн..."
            className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-mono rounded bg-white/[0.06] text-slate-400 border border-white/[0.08]">
              ESC
            </kbd>
          )}
        </div>

        {/* Results Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-4">
          {!cleanQ ? (
            /* Empty state: Quick Shortcuts & suggestions */
            <div className="flex flex-col gap-4 py-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Быстрые переходы
              </span>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    onNavigateTab('collection');
                    onClose();
                  }}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-cyan-500/40 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                >
                  <Music className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-white">Вся коллекция</span>
                  <span className="text-[10px] text-slate-400">{tracks.length} треков</span>
                </button>

                <button
                  onClick={() => {
                    onSelectSmartPlaylist('most_played');
                    onClose();
                  }}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-amber-500/40 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                >
                  <Flame className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-white">Топ треков</span>
                  <span className="text-[10px] text-slate-400">Часто играющие</span>
                </button>

                <button
                  onClick={() => {
                    onSearchOnline('', 'radio');
                    onClose();
                  }}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-rose-500/40 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                >
                  <Radio className="w-4 h-4 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-white">Онлайн-Радио</span>
                  <span className="text-[10px] text-slate-400">40 000+ станций</span>
                </button>

                <button
                  onClick={() => {
                    onOpenSettingsCategory('audio');
                    onClose();
                  }}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-purple-500/40 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                >
                  <Headphones className="w-4 h-4 text-purple-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold text-white">Эквалайзер</span>
                  <span className="text-[10px] text-slate-400">10-band & DSP</span>
                </button>
              </div>

              <div className="pt-2 text-xs text-slate-500 text-center">
                Начните вводить название песни, исполнителя, название плейлиста или настройку
              </div>
            </div>
          ) : (
            <>
              {/* 1. Tracks in collection */}
              {matchedTracks.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                    <span>Треки в коллекции ({matchedTracks.length})</span>
                    <button
                      onClick={() => {
                        onNavigateTab('collection');
                        onClose();
                      }}
                      className="text-cyan-400 hover:text-cyan-300 normal-case font-medium"
                    >
                      Смотреть все →
                    </button>
                  </div>

                  <div className="divide-y divide-white/[0.04] rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                    {matchedTracks.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          onPlayTrack(t);
                          onClose();
                        }}
                        className="p-2 sm:px-3 flex items-center justify-between gap-3 hover:bg-white/[0.06] transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] flex items-center justify-center relative">
                            {t.hasCover ? (
                              <img src={getCoverUrl(t.id)} alt={t.title} className="w-full h-full object-cover" />
                            ) : (
                              <Music className="w-4 h-4 text-slate-500" />
                            )}
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-3.5 h-3.5 text-cyan-400 fill-current" />
                            </div>
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                              {t.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">{t.artist}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddTrackToQueue(t);
                            }}
                            title="В очередь"
                            className="p-1 rounded hover:bg-white/[0.1] text-slate-400 hover:text-cyan-300 transition-colors"
                          >
                            <ListPlus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[11px] font-mono text-slate-500 w-10 text-right">
                            {t.duration > 0 ? formatTime(t.duration) : ''}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Artists in collection */}
              {matchedArtists.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                    Исполнители ({matchedArtists.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {matchedArtists.map(([artName, count]) => (
                      <div
                        key={artName}
                        onClick={() => {
                          onSelectArtist(artName);
                          onClose();
                        }}
                        className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-cyan-500/40 flex items-center justify-between gap-2 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400">
                            <Mic className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                              {artName}
                            </h4>
                            <p className="text-[10px] text-slate-500">{count} треков в коллекции</p>
                          </div>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartArtistFlow(artName);
                            onClose();
                          }}
                          title={`Запустить поток: ${artName}`}
                          className="px-2 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-[10px] font-medium flex items-center gap-1 shrink-0"
                        >
                          <Radio className="w-2.5 h-2.5" />
                          <span>Поток</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Playlists */}
              {matchedPlaylists.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                    Плейлисты ({matchedPlaylists.length})
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {matchedPlaylists.map((pl) => (
                      <div
                        key={pl.id}
                        onClick={() => {
                          if (pl.type === 'smart' && pl.smartKey) {
                            onSelectSmartPlaylist(pl.smartKey);
                          } else {
                            const found = playlists.find((p) => p.id === pl.id);
                            if (found) onSelectPlaylist(found);
                          }
                          onClose();
                        }}
                        className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-cyan-500/40 flex items-center justify-between gap-2 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 text-cyan-400">
                            <ListMusic className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-xs font-semibold text-white group-hover:text-cyan-300 truncate">
                            {pl.name}
                          </span>
                        </div>
                        {pl.count !== undefined && (
                          <span className="text-[10px] font-mono text-slate-500">{pl.count} треков</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Settings deep-links */}
              {matchedSettings.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                    Настройки плеера ({matchedSettings.length})
                  </span>
                  <div className="flex flex-col gap-1">
                    {matchedSettings.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          onOpenSettingsCategory(s.id);
                          onClose();
                        }}
                        className="p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-cyan-500/40 flex items-center justify-between gap-3 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-1.5 rounded-lg bg-white/[0.06] shrink-0">{s.icon}</div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors">
                              {s.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">{s.desc}</p>
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Online Search Action Cards */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.06]">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                  Искать онлайн в открытых каталогах
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    onClick={() => {
                      onSearchOnline(cleanQ, 'tracks');
                      onClose();
                    }}
                    className="p-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                  >
                    <div className="flex items-center justify-between w-full">
                      <Music className="w-4 h-4 text-cyan-400" />
                      <span className="text-[10px] font-mono text-cyan-400 font-semibold">Enter ↵</span>
                    </div>
                    <span className="text-xs font-semibold text-white">Искать треки</span>
                    <span className="text-[11px] text-cyan-300 truncate">«{cleanQ}»</span>
                  </button>

                  <button
                    onClick={() => {
                      onSearchOnline(cleanQ, 'albums');
                      onClose();
                    }}
                    className="p-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                  >
                    <Disc className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-semibold text-white">Искать альбомы</span>
                    <span className="text-[11px] text-purple-300 truncate">«{cleanQ}»</span>
                  </button>

                  <button
                    onClick={() => {
                      onSearchOnline(cleanQ, 'radio');
                      onClose();
                    }}
                    className="p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-left transition-all cursor-pointer flex flex-col gap-1 group"
                  >
                    <Radio className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-semibold text-white">Искать радиостанции</span>
                    <span className="text-[11px] text-rose-300 truncate">«{cleanQ}»</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
