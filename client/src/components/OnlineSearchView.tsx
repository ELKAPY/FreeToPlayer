import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Clock,
  Disc,
  Download,
  History,
  Layers,
  ListPlus,
  Mic2,
  Music,
  Pause,
  Play,
  Radio,
  Search,
  Signal,
  Sliders,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  downloadOnlineTrack,
  fetchRadioByCountry,
  fetchRadioByGenre,
  fetchRadioTop,
  getCoverUrl,
  searchOnlineAlbums,
  searchOnlineTracks,
  searchRadioStations,
} from '../api';
import { type MusicSourceId, useAppSettings } from '../settings';
import type { OnlineAlbum, OnlineTrack, RadioStation, Track } from '../types';
import { formatTime } from '../useAudioPlayer';
import { OnlineQuickSettingsModal } from './OnlineQuickSettingsModal';

interface OnlineSearchViewProps {
  currentTrack: Track | null;
  isPlaying: boolean;
  tracks?: Track[];
  defaultMusicSource?: MusicSourceId;
  onPlayOnlineTrack: (track: Track) => void;
  onAddOnlineTrackToQueue?: (track: Track) => void;
  onTrackDownloaded: (newTrack: Track) => void;
  onStartArtistFlow?: (artist: string) => void;
  onOpenVersions?: (track: Track | OnlineTrack) => void;
  onOpenAlbum?: (album: OnlineAlbum) => void;
  onOpenSettings?: () => void;
}

export const OnlineSearchView: React.FC<OnlineSearchViewProps> = ({
  currentTrack,
  isPlaying,
  tracks = [],
  defaultMusicSource = 'all',
  onPlayOnlineTrack,
  onAddOnlineTrackToQueue,
  onTrackDownloaded,
  onStartArtistFlow,
  onOpenVersions,
  onOpenAlbum,
  onOpenSettings,
}) => {
  const { settings, updateSettings } = useAppSettings();

  const [query, setQuery] = useState(() => {
    try {
      return sessionStorage.getItem('dj_session_online_query') || '';
    } catch {}
    return '';
  });

  const [searchMode, setSearchMode] = useState<'tracks' | 'albums' | 'artists' | 'radio'>(() => {
    try {
      const saved = sessionStorage.getItem('dj_session_online_mode') as any;
      if (saved && ['tracks', 'albums', 'artists', 'radio'].includes(saved)) {
        return saved;
      }
    } catch {}
    return 'tracks';
  });

  const [sourceFilter, setSourceFilter] = useState<MusicSourceId>(() => {
    return settings.defaultMusicSource || defaultMusicSource || 'all';
  });

  const [trackResults, setTrackResults] = useState<OnlineTrack[]>([]);
  const [albumResults, setAlbumResults] = useState<OnlineAlbum[]>([]);
  const [radioStations, setRadioStations] = useState<RadioStation[]>([]);
  const [radioCategory, setRadioCategory] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem('dj_session_radio_category');
      if (saved) return saved;
    } catch {}
    return settings.radioDefaultCategory || 'top';
  });

  // Preserve subtabs state in session
  useEffect(() => {
    try {
      sessionStorage.setItem('dj_session_online_mode', searchMode);
    } catch {}
  }, [searchMode]);

  useEffect(() => {
    try {
      sessionStorage.setItem('dj_session_radio_category', radioCategory);
    } catch {}
  }, [radioCategory]);

  useEffect(() => {
    try {
      sessionStorage.setItem('dj_session_online_query', query);
    } catch {}
  }, [query]);
  const [isLoadingRadio, setIsLoadingRadio] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  // Result sorting & filtering
  const [resultSort, setResultSort] = useState<'relevance' | 'duration' | 'title'>('relevance');
  const [filterCleanOnly, setFilterCleanOnly] = useState(false);
  const [filterMinDuration, setFilterMinDuration] = useState(false);

  // Settings modal
  const [isQuickSettingsOpen, setIsQuickSettingsOpen] = useState(false);

  // Search history and recent online tracks
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dj_search_history');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return ['Король и Шут', 'Metallica', 'Queen', 'Кино', 'Linkin Park'];
  });

  const [recentOnlineTracks, setRecentOnlineTracks] = useState<OnlineTrack[]>(() => {
    try {
      const saved = localStorage.getItem('dj_recent_online_tracks');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  });

  // Batch rendering / progressive loading for search results
  const [visibleTrackLimit, setVisibleTrackLimit] = useState<number>(25);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  // Keep sourceFilter synced if settings change
  useEffect(() => {
    if (settings.defaultMusicSource) {
      setSourceFilter(settings.defaultMusicSource);
    }
  }, [settings.defaultMusicSource]);

  // Reset pagination limit when query, source or mode changes
  useEffect(() => {
    setVisibleTrackLimit(25);
  }, [query, sourceFilter, searchMode]);

  const saveQueryToHistory = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || !settings.saveSearchHistory) return;

    setSearchHistory((prev) => {
      const limit = settings.searchHistoryLimit || 15;
      const next = [trimmed, ...prev.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, limit);
      try {
        localStorage.setItem('dj_search_history', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('dj_search_history');
    } catch (e) {}
  };

  const removeHistoryItem = (itemToRemove: string) => {
    setSearchHistory((prev) => {
      const next = prev.filter((item) => item !== itemToRemove);
      try {
        localStorage.setItem('dj_search_history', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const loadRadioStations = async (cat: string, customQuery?: string) => {
    setIsLoadingRadio(true);
    try {
      let data: RadioStation[] = [];
      if (customQuery && customQuery.trim()) {
        data = await searchRadioStations(customQuery.trim());
      } else if (cat === 'top') {
        data = await fetchRadioTop();
      } else if (cat === 'RU') {
        data = await fetchRadioByCountry('RU');
      } else {
        data = await fetchRadioByGenre(cat);
      }

      // Filter by min bitrate if configured
      if (settings.radioMinBitrate > 0) {
        data = data.filter((s) => (s.bitrate || 0) >= settings.radioMinBitrate);
      }
      setRadioStations(data);
    } catch (e) {
      console.error('Failed to load radio:', e);
      setRadioStations([]);
    } finally {
      setIsLoadingRadio(false);
    }
  };

  const handlePlayRadio = (station: RadioStation) => {
    const virtualTrack: Track = {
      id: 'radio_' + station.id,
      title: station.name,
      artist: station.country ? `${station.country} • Прямой эфир` : 'Прямой эфир (Live)',
      album: station.tags && station.tags.length > 0 ? station.tags.slice(0, 3).join(', ') : 'Радио онлайн',
      year: new Date().getFullYear(),
      duration: 0,
      format: station.codec || 'MP3',
      isLossless: false,
      fileSize: 0,
      hasCover: !!station.favicon,
      coverUrl: station.favicon,
      filename: '',
      originalName: `${station.name}.mp3`,
      createdAt: new Date().toISOString(),
    };
    (virtualTrack as any).onlineStreamUrl = station.streamUrl;
    onPlayOnlineTrack(virtualTrack);
  };

  const performSearch = async (targetQuery: string, source: MusicSourceId, mode: 'tracks' | 'albums' | 'artists' | 'radio') => {
    const q = targetQuery.trim();
    if (!q) return;

    saveQueryToHistory(q);
    setIsSearching(true);
    try {
      if (mode === 'tracks' || mode === 'artists') {
        const data = await searchOnlineTracks(q, source, mode);
        setTrackResults(Array.isArray(data) ? data : []);
      } else if (mode === 'albums') {
        const data = await searchOnlineAlbums(q, source);
        setAlbumResults(Array.isArray(data) ? data : []);
      } else {
        await loadRadioStations(radioCategory, q);
      }
    } catch (err) {
      console.error('Online search failed:', err);
      setTrackResults([]);
      setAlbumResults([]);
      setRadioStations([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent, directQuery?: string) => {
    if (e) e.preventDefault();
    const q = directQuery !== undefined ? directQuery : query;
    if (directQuery !== undefined) {
      setQuery(directQuery);
    }
    performSearch(q, sourceFilter, searchMode);
  };

  // Debounced live search
  const debounceTimerRef = useRef<any>(null);
  useEffect(() => {
    if (!settings.liveSearchDebounce || !query.trim() || query.trim().length < 2) {
      return;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      performSearch(query, sourceFilter, searchMode);
    }, 450);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [query, sourceFilter, searchMode, settings.liveSearchDebounce]);

  const handleModeChange = (mode: 'tracks' | 'albums' | 'artists' | 'radio') => {
    setSearchMode(mode);
    if (mode === 'radio') {
      if (radioStations.length === 0) {
        loadRadioStations(radioCategory);
      }
      return;
    }
    if (query.trim()) {
      performSearch(query, sourceFilter, mode);
    }
  };

  const handleSelectSource = (src: MusicSourceId) => {
    setSourceFilter(src);
    updateSettings({ defaultMusicSource: src });
    if (query.trim()) {
      performSearch(query, src, searchMode);
    }
  };

  const makeVirtualTrack = (item: OnlineTrack): Track => {
    const virtualTrack: Track = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album || 'Онлайн поток',
      year: item.year || new Date().getFullYear(),
      duration: item.duration,
      format: 'MP3',
      isLossless: false,
      fileSize: 0,
      hasCover: !!item.coverUrl,
      coverUrl: item.coverUrl,
      filename: '',
      originalName: `${item.artist} - ${item.title}.mp3`,
      createdAt: new Date().toISOString(),
    };
    (virtualTrack as any).onlineStreamUrl = item.streamUrl;
    return virtualTrack;
  };

  const handlePlay = (item: OnlineTrack) => {
    setRecentOnlineTracks((prev) => {
      const next = [item, ...prev.filter((t) => t.id !== item.id)].slice(0, 20);
      try {
        localStorage.setItem('dj_recent_online_tracks', JSON.stringify(next));
      } catch (e) {}
      return next;
    });

    onPlayOnlineTrack(makeVirtualTrack(item));
  };

  const handleAddToQueue = (item: OnlineTrack) => {
    if (onAddOnlineTrackToQueue) {
      onAddOnlineTrackToQueue(makeVirtualTrack(item));
    }
  };

  const handleDownload = async (item: OnlineTrack) => {
    setDownloadingId(item.id);
    try {
      const res = await downloadOnlineTrack(item);
      if (res.success && res.track) {
        setDownloadedIds((prev) => new Set(prev).add(item.id));
        onTrackDownloaded(res.track);
        if (settings.autoPlayAfterDownload) {
          onPlayOnlineTrack(res.track);
        }
      }
    } catch (e) {
      alert('Ошибка при сохранении трека');
    } finally {
      setDownloadingId(null);
    }
  };

  // Local collection matches when searching tracks
  const localMatches = useMemo(() => {
    if (!settings.showLocalMatchesInOnline || !query.trim() || tracks.length === 0) {
      return [];
    }
    const q = query.trim().toLowerCase();
    return tracks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          (t.album && t.album.toLowerCase().includes(q))
      )
      .slice(0, 4);
  }, [tracks, query, settings.showLocalMatchesInOnline]);

  // Set of local track keys to flag "Already in collection"
  const localKeysSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of tracks) {
      const k = `${t.artist.toLowerCase().trim()}_${t.title.toLowerCase().trim()}`;
      s.add(k);
    }
    return s;
  }, [tracks]);

  const isTrackInCollection = (item: OnlineTrack) => {
    if (downloadedIds.has(item.id)) return true;
    const k = `${(item.artist || '').toLowerCase().trim()}_${(item.title || '').toLowerCase().trim()}`;
    return localKeysSet.has(k);
  };

  // Filter & Sort Online Track Results
  const processedTrackResults = useMemo(() => {
    let list = [...trackResults];

    if (filterCleanOnly) {
      list = list.filter((t) => !/(live|remix|cover|acoustic|instrumental)/i.test(t.title));
    }

    if (filterMinDuration) {
      list = list.filter((t) => t.duration >= 90);
    }

    // Client-side relevance re-ranking to guarantee exact artist/title matches stay at the very top (#1)
    if (resultSort === 'relevance' && query.trim()) {
      const q = query.trim().toLowerCase();
      const cleanQ = q.replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
      const qWords = cleanQ.split(' ').filter(Boolean);

      const scoreTrack = (t: OnlineTrack) => {
        const a = (t.artist || '').toLowerCase().replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const tit = (t.title || '').toLowerCase().replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
        const aWords = a.split(' ').filter(Boolean);
        const titWords = tit.split(' ').filter(Boolean);

        let s = 0;

        // Check exact whole-word matching
        const isExactArtistWord = aWords.includes(cleanQ);
        const isExactTitleWord = titWords.includes(cleanQ);

        // 1. Exact artist match: supreme priority
        if (a === cleanQ) {
          s += 20000;
        } else if (isExactArtistWord) {
          s += 15000;
        } else if (a.startsWith(cleanQ + ' ') || a.endsWith(' ' + cleanQ) || a.includes(' ' + cleanQ + ' ')) {
          s += 12000;
        } else if (a.startsWith(cleanQ)) {
          s += 8000;
        } else if (a.includes(cleanQ)) {
          s += 5000;
        }

        // 2. Exact title match
        if (tit === cleanQ) {
          s += 6000;
        } else if (isExactTitleWord) {
          s += 4500;
        } else if (tit.startsWith(cleanQ)) {
          s += 3500;
        } else if (tit.includes(cleanQ)) {
          s += 2000;
        }

        // 3. Word token matches
        let artistWordsMatched = 0;
        let titleWordsMatched = 0;
        for (const w of qWords) {
          if (aWords.includes(w)) artistWordsMatched++;
          if (titWords.includes(w)) titleWordsMatched++;
        }

        if (qWords.length > 0 && artistWordsMatched >= qWords.length) {
          s += 4000;
        }
        s += artistWordsMatched * 600 + titleWordsMatched * 300;

        // Heavy penalty for accidental partial substring matches that are NOT the artist and NOT the title
        // e.g. query "xxxmanera" matched inside "TraXXXman"
        const hasArtistMatch = a.includes(cleanQ) || isExactArtistWord || (qWords.length > 0 && artistWordsMatched === qWords.length);
        const hasTitleMatch = tit.includes(cleanQ) || isExactTitleWord || (qWords.length > 0 && titleWordsMatched === qWords.length);

        if (!hasArtistMatch && !hasTitleMatch) {
          s -= 15000;
        }

        // Deduct points for garbage or cover channels in artist name
        if (/(official|lyrics|topic|remix|cover|karaoke|slowed|sped up)/i.test(t.artist || '')) {
          s -= 500;
        }

        return s;
      };

      list.sort((a, b) => scoreTrack(b) - scoreTrack(a));
    } else if (resultSort === 'duration') {
      list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    } else if (resultSort === 'title') {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    return list;
  }, [trackResults, filterCleanOnly, filterMinDuration, resultSort, query]);

  // Infinite scroll observer: load next batch when scrolling near bottom
  useEffect(() => {
    if (!loadMoreTriggerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleTrackLimit((prev) => {
            if (prev < processedTrackResults.length) {
              return Math.min(prev + 25, processedTrackResults.length);
            }
            return prev;
          });
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(loadMoreTriggerRef.current);
    return () => observer.disconnect();
  }, [processedTrackResults.length]);

  const sourceLabels: { id: MusicSourceId; label: string; badge: string }[] = [
    { id: 'all', label: 'Все источники', badge: 'Агрегатор' },
    { id: 'deezer', label: 'Deezer', badge: 'HD 1000x1000' },
    { id: 'yandex', label: 'Яндекс Музыка', badge: '320 kbps' },
    { id: 'hitmo', label: 'Hitmo', badge: 'Быстрый MP3' },
    { id: 'soundcloud', label: 'SoundCloud', badge: 'Ремиксы/Live' },
    { id: 'vk', label: 'VK Музыка', badge: 'ВК/Каверы' },
    { id: 'youtube', label: 'YouTube Music', badge: 'Аудио/Клипы' },
    { id: 'audius', label: 'Audius', badge: 'Электроника' },
  ];

  const getSourceBadgeClass = (source?: string) => {
    switch (source) {
      case 'deezer':
        return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
      case 'yandex':
        return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
      case 'hitmo':
        return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
      case 'soundcloud':
        return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
      case 'vk':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'youtube':
        return 'bg-red-500/15 text-red-300 border-red-500/30';
      case 'audius':
        return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
      default:
        return 'bg-white/[0.08] text-slate-300 border-white/[0.1]';
    }
  };

  return (
    <div className="w-full max-w-[1720px] mx-auto px-2 sm:px-4 lg:px-6 py-4 flex flex-col gap-5 select-none">
      {/* Top Header & Settings trigger */}
      <div className="border-b border-white/[0.06] pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Search className="w-5 h-5 text-cyan-400" />
            <span>Поиск музыки и радио</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Мировой поиск композиций, альбомов и 40 000+ радиостанций прямого эфира без рекламы
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsQuickSettingsOpen(true)}
            title="Настройки онлайн-поиска и каталогов"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] hover:border-cyan-500/40 text-xs font-medium transition-all cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
            <span>Настройки поиска</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation Tabs: Tracks vs Albums vs Radio */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 sm:gap-2 p-1.5 bg-white/[0.03] rounded-2xl border border-white/[0.06] overflow-x-auto">
          <button
            onClick={() => handleModeChange('tracks')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              searchMode === 'tracks'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Music className="w-4 h-4" />
            <span>Треки</span>
          </button>

          <button
            onClick={() => handleModeChange('albums')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              searchMode === 'albums'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Disc className="w-4 h-4" />
            <span>Альбомы</span>
          </button>

          <button
            onClick={() => handleModeChange('artists')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              searchMode === 'artists'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Исполнители</span>
          </button>

          <button
            onClick={() => handleModeChange('radio')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
              searchMode === 'radio'
                ? 'bg-rose-500 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Онлайн-Радио</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/40 text-rose-200 font-mono font-bold">
              40k+
            </span>
          </button>
        </div>

        {searchMode === 'tracks' && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="hidden sm:inline">Живой поиск:</span>
            <button
              onClick={() => updateSettings({ liveSearchDebounce: !settings.liveSearchDebounce })}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all cursor-pointer active:scale-95 ${
                settings.liveSearchDebounce
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-white/[0.04] text-slate-500 hover:text-slate-300 border border-white/[0.06]'
              }`}
            >
              {settings.liveSearchDebounce ? 'Включен' : 'По Enter'}
            </button>
          </div>
        )}
      </div>

      {/* Sources visual pills filter (Always visible when in Tracks, Albums or Artists mode) */}
      {(searchMode === 'tracks' || searchMode === 'albums' || searchMode === 'artists') && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {sourceLabels.map((src) => {
            const isSelected = sourceFilter === src.id;
            return (
              <button
                key={src.id}
                onClick={() => handleSelectSource(src.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all cursor-pointer whitespace-nowrap active:scale-95 ${
                  isSelected
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm font-semibold'
                    : 'bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-white border border-white/[0.05]'
                }`}
              >
                <span>{src.label}</span>
                <span className="text-[9px] font-mono text-slate-500">{src.badge}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Radio Genre Chips (When in Radio mode) */}
      {searchMode === 'radio' && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'top', label: '🌍 Мировой Топ' },
            { id: 'RU', label: '🇷🇺 Россия' },
            { id: 'rock', label: '🎸 Рок' },
            { id: 'metal', label: '⚡ Метал' },
            { id: 'lofi', label: '☕ Lo-Fi / Chill' },
            { id: 'synthwave', label: '🌆 Synthwave' },
            { id: 'jazz', label: '🎷 Джаз' },
            { id: 'edm', label: '🪩 Dance / EDM' },
            { id: '80s', label: '📻 Ретро 80s/90s' },
            { id: 'classical', label: '🎻 Классика' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setRadioCategory(cat.id);
                updateSettings({ radioDefaultCategory: cat.id });
                loadRadioStations(cat.id);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-95 ${
                radioCategory === cat.id
                  ? 'bg-rose-500/25 text-rose-200 border border-rose-500/50 shadow-[0_0_14px_rgba(244,63,94,0.35)]'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 border border-white/[0.06]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Search Input Form */}
      <form onSubmit={(e) => handleSearchSubmit(e)} className="flex items-center gap-2 w-full">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              searchMode === 'tracks'
                ? 'Введите название песни или исполнителя (например, Король и Шут, Metallica, Кино)...'
                : searchMode === 'albums'
                ? 'Введите название альбома или группы (например, Master of Puppets, Linkin Park)...'
                : searchMode === 'artists'
                ? 'Введите имя исполнителя (например, Queen, Цой, Rammstein, Eminem)...'
                : 'Поиск среди 40 000+ радиостанций (Maximum, Record, BBC, Kiss, Jazz)...'
            }
            className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/60 shadow-inner"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setTrackResults([]);
                setAlbumResults([]);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white rounded hover:bg-white/[0.1] transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          type="submit"
          disabled={isSearching || isLoadingRadio || !query.trim()}
          className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-sm font-semibold transition-all cursor-pointer shadow-md disabled:opacity-40 shrink-0 active:scale-95"
        >
          {isSearching || isLoadingRadio ? 'Поиск...' : 'Найти'}
        </button>
      </form>

      {/* Sorting & Filter toolbar when results exist in Tracks mode */}
      {searchMode === 'tracks' && trackResults.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-slate-400 px-1 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-mono text-cyan-400 font-semibold">{processedTrackResults.length} треков</span>
            <span>•</span>
            <div className="flex items-center gap-1.5">
              <span>Сортировка:</span>
              <select
                value={resultSort}
                onChange={(e) => setResultSort(e.target.value as any)}
                className="bg-white/[0.04] border border-white/[0.08] rounded-lg px-2 py-0.5 text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="relevance" className="bg-[#0b0c13]">По релевантности</option>
                <option value="duration" className="bg-[#0b0c13]">По длительности</option>
                <option value="title" className="bg-[#0b0c13]">По названию</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFilterCleanOnly(!filterCleanOnly)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterCleanOnly
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-medium'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white'
              }`}
            >
              Без каверов/live
            </button>

            <button
              onClick={() => setFilterMinDuration(!filterMinDuration)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterMinDuration
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-medium'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white'
              }`}
            >
              Больше 1:30
            </button>
          </div>
        </div>
      )}

      {/* Results Container */}
      <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4 flex flex-col gap-3 min-h-[320px]">
        {searchMode === 'tracks' ? (
          <>
            {/* Local Collection Matches Section (Requirement: Human-friendly search!) */}
            {localMatches.length > 0 && (
              <div className="flex flex-col gap-2 p-3 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20 mb-2">
                <div className="flex items-center justify-between text-xs font-semibold text-cyan-400">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Найдено в вашей локальной медиатеке ({localMatches.length})</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-normal">Играет прямо с диска без интернета</span>
                </div>

                <div className="divide-y divide-white/[0.04]">
                  {localMatches.map((t) => {
                    const isCur = currentTrack?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => onPlayOnlineTrack(t)}
                        className="py-2 flex items-center justify-between gap-3 hover:bg-white/[0.04] rounded-lg px-2 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] flex items-center justify-center relative">
                            {t.hasCover ? (
                              <img src={getCoverUrl(t.id)} alt={t.title} className="w-full h-full object-cover" />
                            ) : (
                              <Music className="w-4 h-4 text-slate-500" />
                            )}
                            {isCur && isPlaying ? (
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                <Pause className="w-3.5 h-3.5 text-cyan-400 fill-current" />
                              </div>
                            ) : (
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Play className="w-3.5 h-3.5 text-cyan-400 fill-current" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-white group-hover:text-cyan-300 transition-colors truncate">
                              {t.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">{t.artist}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" />
                            <span>В коллекции</span>
                          </span>
                          <span className="text-[11px] font-mono text-slate-500 w-10 text-right">
                            {t.duration > 0 ? formatTime(t.duration) : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Online Results List */}
            {processedTrackResults.length === 0 ? (
              isSearching ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400 text-xs">
                  <Disc className="w-8 h-8 text-cyan-400 animate-spin mb-3 opacity-80" />
                  <span>Идет поиск композиций по открытым каталогам...</span>
                </div>
              ) : (
                /* Default History & Recents */
                <div className="flex flex-col gap-6 p-2">
                  {searchHistory.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                          <History className="w-3.5 h-3.5 text-cyan-400" />
                          <span>История поиска</span>
                        </div>
                        <button
                          onClick={clearSearchHistory}
                          className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          Очистить
                        </button>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {searchHistory.map((item) => (
                          <div
                            key={item}
                            onClick={() => handleSearchSubmit(undefined, item)}
                            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-cyan-500/40 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
                          >
                            <Search className="w-3 h-3 text-slate-500 group-hover:text-cyan-400" />
                            <span>{item}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeHistoryItem(item);
                              }}
                              title="Удалить из истории"
                              className="p-0.5 rounded text-slate-600 hover:text-rose-400 transition-colors ml-1"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {recentOnlineTracks.length > 0 && (
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Недавно прослушанные онлайн-треки</span>
                        </div>
                        <button
                          onClick={() => {
                            setRecentOnlineTracks([]);
                            try {
                              localStorage.removeItem('dj_recent_online_tracks');
                            } catch (e) {}
                          }}
                          className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          Очистить список
                        </button>
                      </div>

                      <div className="divide-y divide-white/[0.04] rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                        {recentOnlineTracks.slice(0, 8).map((item, idx) => {
                          const isCurrentPlaying = currentTrack?.id === item.id;
                          return (
                            <div
                              key={`recent_${item.id}_${idx}`}
                              onClick={() => handlePlay(item)}
                              className="group flex items-center justify-between p-2.5 sm:px-3 hover:bg-white/[0.04] transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className="w-6 text-center shrink-0 flex items-center justify-center">
                                  {isCurrentPlaying && isPlaying ? (
                                    <Pause className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                                  ) : (
                                    <Play className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 fill-current" />
                                  )}
                                </div>

                                <div className="w-9 h-9 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] flex items-center justify-center">
                                  {item.coverUrl ? (
                                    <img
                                      src={item.coverUrl}
                                      alt={item.title}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <Music className="w-4 h-4 text-slate-600" />
                                  )}
                                </div>

                                <div className="min-w-0 pr-2">
                                  <h4
                                    className={`text-xs font-semibold truncate ${
                                      isCurrentPlaying ? 'text-cyan-400' : 'text-slate-200'
                                    }`}
                                  >
                                    {item.title}
                                  </h4>
                                  <p className="text-[11px] text-slate-500 truncate">{item.artist}</p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-mono text-slate-500">{item.durStr}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {searchHistory.length === 0 && recentOnlineTracks.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs">
                      <Search className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
                      <span>Введите название трека или исполнителя в поле выше для начала поиска</span>
                    </div>
                  )}
                </div>
              )
            ) : (
              <>
                <div className="divide-y divide-white/[0.04]">
                  {processedTrackResults.slice(0, visibleTrackLimit).map((item, idx) => {
                  if (!item) return null;
                  const isCurrentPlaying = currentTrack?.id === item.id;
                  const inCol = isTrackInCollection(item);
                  const isDownloading = downloadingId === item.id;
                  const safeKey = `${item.source || 'online'}_${item.id || idx}_${idx}`;

                  return (
                    <div
                      key={safeKey}
                      className={`group flex items-center justify-between p-2.5 sm:px-3 rounded-xl transition-colors ${
                        isCurrentPlaying
                          ? 'bg-white/[0.08] text-white'
                          : 'hover:bg-white/[0.04] text-slate-300'
                      }`}
                    >
                      {/* Play & Info */}
                      <div
                        onClick={() => handlePlay(item)}
                        className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="w-6 text-center shrink-0 flex items-center justify-center">
                          <span className="text-xs font-mono text-slate-500 group-hover:hidden">
                            {idx + 1}
                          </span>
                          {isCurrentPlaying && isPlaying ? (
                            <Pause className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-cyan-400 hidden group-hover:block fill-cyan-400" />
                          )}
                        </div>

                        <div className="w-10 h-10 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] relative flex items-center justify-center">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt={item.title || 'Cover'}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                          ) : (
                            <Music className="w-4 h-4 text-slate-500" />
                          )}
                        </div>

                        <div className="min-w-0 pr-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4
                              className={`text-xs sm:text-sm font-semibold truncate ${
                                isCurrentPlaying ? 'text-cyan-400' : 'text-white'
                              }`}
                            >
                              {item.title || 'Без названия'}
                            </h4>
                            {item.sourceName && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded border font-mono ${getSourceBadgeClass(
                                  item.source
                                )}`}
                              >
                                {item.sourceName}
                              </span>
                            )}
                            {inCol && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono font-semibold flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" />
                                <span>В коллекции</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                if (item.artist && onStartArtistFlow) {
                                  onStartArtistFlow(item.artist);
                                }
                              }}
                              className="hover:text-cyan-400 hover:underline cursor-pointer"
                            >
                              {item.artist || 'Неизвестный исполнитель'}
                            </span>
                            {item.album && ` • ${item.album}`}
                          </p>
                        </div>
                      </div>

                      {/* Right Action buttons */}
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        <span className="w-11 text-right font-mono text-xs text-slate-400 hidden sm:inline mr-1">
                          {item.durStr || '--:--'}
                        </span>

                        {/* Add to Queue button */}
                        {onAddOnlineTrackToQueue && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToQueue(item);
                            }}
                            title="Добавить в очередь воспроизведения"
                            className="w-8 h-8 rounded-xl border border-white/[0.06] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-90"
                          >
                            <ListPlus className="w-4 h-4" />
                          </button>
                        )}

                        {/* Artist flow button */}
                        {onStartArtistFlow && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onStartArtistFlow(item.artist || '');
                            }}
                            title={`Запустить поток по исполнителю: ${item.artist}`}
                            className="w-8 h-8 rounded-xl border border-white/[0.06] text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 hover:border-cyan-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-90"
                          >
                            <Radio className="w-4 h-4" />
                          </button>
                        )}

                        {/* Versions button */}
                        {onOpenVersions && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenVersions(item);
                            }}
                            title="Поиск версий песни (Live, Reverb, Acoustic, Remix)"
                            className="w-8 h-8 rounded-xl border border-white/[0.06] text-slate-400 hover:text-purple-300 hover:bg-purple-500/15 hover:border-purple-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-90"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                        )}

                        {/* Download button */}
                        <button
                          onClick={() => handleDownload(item)}
                          disabled={inCol || isDownloading}
                          title={inCol ? 'Уже сохранено в медиатеку' : 'Скачать в коллекцию'}
                          className={`h-8 px-3 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 text-xs ${
                            inCol
                              ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/30'
                              : 'text-slate-300 hover:text-cyan-300 hover:bg-cyan-500/15 border border-white/[0.07] hover:border-cyan-500/40 active:scale-95'
                          }`}
                        >
                          {inCol ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              <span className="hidden sm:inline text-[11px] font-sans font-medium">В коллекции</span>
                            </>
                          ) : (
                            <>
                              <Download
                                className={`w-4 h-4 ${isDownloading ? 'animate-bounce text-cyan-400' : ''}`}
                              />
                              <span className="hidden sm:inline text-[11px] font-sans font-medium">
                                {isDownloading ? 'Загрузка...' : 'Скачать'}
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progressive loading / Pagination controls */}
              {processedTrackResults.length > 25 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 mt-3 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-xs text-slate-400 font-mono">
                    Показано{' '}
                    <span className="text-cyan-300 font-bold">
                      {Math.min(visibleTrackLimit, processedTrackResults.length)}
                    </span>{' '}
                    из <span className="text-white font-bold">{processedTrackResults.length}</span> найденных треков
                  </div>

                  {visibleTrackLimit < processedTrackResults.length && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setVisibleTrackLimit((prev) => Math.min(prev + 25, processedTrackResults.length))
                        }
                        className="px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold cursor-pointer active:scale-95 transition-all shadow-sm"
                      >
                        Загрузить ещё (+25)
                      </button>
                      <button
                        onClick={() => setVisibleTrackLimit(processedTrackResults.length)}
                        className="px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold cursor-pointer active:scale-95 transition-all"
                      >
                        Показать все
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Scroll Trigger for seamless infinite scroll */}
              {visibleTrackLimit < processedTrackResults.length && (
                <div ref={loadMoreTriggerRef} className="h-8 w-full" />
              )}
            </>
          )}
          </>
        ) : searchMode === 'albums' ? (
          /* Albums Results Grid */
          !Array.isArray(albumResults) || albumResults.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs">
              <Disc className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
              <span>
                {isSearching
                  ? 'Идет поиск альбомов...'
                  : 'Введите запрос в поле выше, чтобы найти альбомы'}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {albumResults.map((alb, idx) => {
                if (!alb) return null;
                const safeAlbKey = `${alb.source || 'alb'}_${alb.id || idx}_${idx}`;

                return (
                  <div
                    key={safeAlbKey}
                    onClick={() => onOpenAlbum && onOpenAlbum(alb)}
                    className="p-3 rounded-2xl bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-cyan-500/40 transition-all cursor-pointer flex flex-col gap-2.5 group shadow-sm hover:shadow-cyan-500/10"
                  >
                    <div className="w-full aspect-square rounded-xl bg-black/40 overflow-hidden border border-white/[0.08] relative group-hover:scale-102 transition-transform flex items-center justify-center">
                      {alb.coverUrl ? (
                        <img
                          src={alb.coverUrl}
                          alt={alb.title || 'Cover'}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Disc className="w-10 h-10 text-slate-600" />
                      )}
                      <div className="absolute top-2 right-2">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded-md border font-mono backdrop-blur-md ${getSourceBadgeClass(
                            alb.source
                          )}`}
                        >
                          {alb.sourceName}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-cyan-400 transition-colors">
                        {alb.title || 'Без названия'}
                      </h4>
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {alb.artist || 'Разные исполнители'}
                      </p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mt-1">
                        {alb.year > 0 && <span>{alb.year}</span>}
                        <span>{alb.trackCount || 0} треков</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : searchMode === 'artists' ? (
          /* Artists Discography & Deduplicated Tracks */
          (() => {
            // In Artists mode, prioritize and filter tracks belonging to the searched artist
            const q = query.trim().toLowerCase();
            const cleanQ = q.replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
            const qWords = cleanQ.split(' ').filter(Boolean);

            const isMatchingArtist = (t: OnlineTrack) => {
              const a = (t.artist || '').toLowerCase().replace(/[^a-zа-я0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
              if (a === cleanQ || a.startsWith(cleanQ) || a.includes(cleanQ)) return true;
              return qWords.length > 0 && qWords.every((w) => a.includes(w));
            };

            // First priority: tracks where the artist actually matches the search query!
            const directArtistTracks = processedTrackResults.filter(isMatchingArtist);
            const fallbackTracks = processedTrackResults.filter((t) => !isMatchingArtist(t));
            const tracksByArtist = directArtistTracks.length > 0 ? directArtistTracks : fallbackTracks;

            // Deduplicate titles within this artist's discography
            const uniqueTitlesMap = new Map<string, OnlineTrack>();
            for (const t of tracksByArtist) {
              const norm = t.title
                .toLowerCase()
                .replace(/\s*[\(\[](official\s*(music\s*)?(video|audio)|lyric\s*video|audio|hd|4k|visualizer)[\)\]]/gi, '')
                .replace(/[^a-zа-я0-9\s]/gi, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              if (!uniqueTitlesMap.has(norm)) {
                uniqueTitlesMap.set(norm, t);
              }
            }
            const deduplicated = Array.from(uniqueTitlesMap.values());

            if (deduplicated.length === 0) {
              return (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs">
                  <Users className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
                  <span>
                    {isSearching
                      ? 'Идет поиск композиций исполнителя...'
                      : 'Введите имя исполнителя или группы в поле выше, чтобы открыть дискографию без повторов'}
                  </span>
                </div>
              );
            }

            // Determine display artist name: pick the one matching cleanQ or first track's artist
            const matchedTrack = directArtistTracks[0] || deduplicated[0];
            const mainArtist = matchedTrack?.artist && matchedTrack.artist !== '-----' ? matchedTrack.artist : query;

            return (
              <div className="flex flex-col gap-4">
                {/* Artist Banner Header */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-500/10 via-purple-500/10 to-transparent border border-cyan-500/20 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-14 h-14 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center overflow-hidden shrink-0 shadow-lg">
                      {deduplicated[0]?.coverUrl ? (
                        <img
                          src={deduplicated[0].coverUrl}
                          alt={mainArtist}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Mic2 className="w-6 h-6 text-cyan-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-semibold uppercase">
                          Исполнитель
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {deduplicated.length} уникальных треков (без дубликатов)
                        </span>
                      </div>
                      <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight truncate mt-0.5">
                        {mainArtist}
                      </h2>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      if (deduplicated.length > 0) {
                        const firstTrack = makeVirtualTrack(deduplicated[0]);
                        onPlayOnlineTrack(firstTrack);
                        if (onAddOnlineTrackToQueue) {
                          for (let i = 1; i < deduplicated.length; i++) {
                            onAddOnlineTrackToQueue(makeVirtualTrack(deduplicated[i]));
                          }
                        }
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 cursor-pointer active:scale-95 transition-all shrink-0"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Включить всё</span>
                  </button>
                </div>

                {/* Deduplicated tracks list */}
                <div className="divide-y divide-white/[0.04]">
                  {deduplicated.map((item, idx) => {
                    const isCur = currentTrack?.id === item.id;
                    const isDown = downloadedIds.has(item.id);
                    const isDownloadingThis = downloadingId === item.id;

                    return (
                      <div
                        key={item.id}
                        onClick={() => onPlayOnlineTrack(makeVirtualTrack(item))}
                        className={`py-2 px-2.5 flex items-center justify-between gap-3 rounded-xl transition-all cursor-pointer group ${
                          isCur ? 'bg-cyan-500/10 border border-cyan-500/30' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-5 text-center text-[11px] font-mono text-slate-500 group-hover:hidden">
                            {idx + 1}
                          </span>
                          <Play className="w-4 h-4 text-cyan-400 hidden group-hover:block fill-current shrink-0" />

                          <div className="w-9 h-9 rounded-lg bg-black/40 overflow-hidden shrink-0 border border-white/[0.06] relative flex items-center justify-center">
                            {item.coverUrl ? (
                              <img
                                src={item.coverUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <Music className="w-4 h-4 text-slate-500" />
                            )}
                            {isCur && isPlaying && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h4
                              className={`text-xs font-semibold truncate ${
                                isCur ? 'text-cyan-400' : 'text-white group-hover:text-cyan-300'
                              }`}
                            >
                              {item.title}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {item.artist} {item.album ? `• ${item.album}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.sourceName && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-md border font-mono ${getSourceBadgeClass(
                                item.source
                              )}`}
                            >
                              {item.sourceName}
                            </span>
                          )}

                          <span className="text-[11px] font-mono text-slate-400 w-10 text-right">
                            {item.durStr || (item.duration > 0 ? formatTime(item.duration) : '')}
                          </span>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(item);
                            }}
                            disabled={isDown || isDownloadingThis}
                            title={isDown ? 'Скачано в коллекцию' : 'Скачать MP3'}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                              isDown
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : 'bg-white/[0.04] text-slate-400 hover:text-white border-white/[0.06] hover:bg-white/[0.08]'
                            }`}
                          >
                            {isDown ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Download className={`w-3.5 h-3.5 ${isDownloadingThis ? 'animate-bounce' : ''}`} />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()
        ) : (
          /* Radio Stations Results Grid */
          isLoadingRadio ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-400 text-xs">
              <Signal className="w-8 h-8 text-rose-400 animate-pulse mb-3" />
              <span>Подключение к мировым радиостанциям...</span>
            </div>
          ) : !Array.isArray(radioStations) || radioStations.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-slate-500 text-xs">
              <Radio className="w-10 h-10 text-slate-600 mb-2 opacity-60" />
              <span>Радиостанции не найдены. Выберите другой жанр или введите название в поиске.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {radioStations.map((station) => {
                const isThisStationPlaying = currentTrack?.id === 'radio_' + station.id && isPlaying;
                return (
                  <div
                    key={station.id}
                    onClick={() => handlePlayRadio(station)}
                    className={`p-3.5 rounded-2xl border transition-all duration-300 cursor-pointer flex items-center justify-between gap-3 group ${
                      isThisStationPlaying
                        ? 'bg-rose-500/15 border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.25)] -translate-y-0.5'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] border-white/[0.06] hover:border-rose-500/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-500/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-xl bg-black/40 overflow-hidden shrink-0 border border-white/[0.08] relative flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                        {station.favicon ? (
                          <img
                            src={station.favicon}
                            alt={station.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Radio className="w-5 h-5 text-rose-400" />
                        )}
                        {isThisStationPlaying && (
                          <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex items-center justify-center">
                            <span className="w-3 h-3 rounded-full bg-rose-500 animate-ping" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4
                          className={`text-xs sm:text-sm font-semibold truncate transition-colors ${
                            isThisStationPlaying ? 'text-rose-400 font-bold' : 'text-white group-hover:text-rose-300'
                          }`}
                        >
                          {station.name}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                          {station.country && <span className="text-slate-300">{station.country}</span>}
                          {station.codec && <span className="text-slate-500">• {station.codec}</span>}
                          {(station.bitrate ?? 0) > 0 && <span className="text-rose-400/80">• {station.bitrate}k</span>}
                        </div>
                        {station.tags && station.tags.length > 0 && (
                          <div className="flex items-center gap-1 mt-1 overflow-hidden">
                            {station.tags.slice(0, 2).map((t, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] px-1.5 py-0.2 rounded-md bg-white/[0.04] group-hover:bg-rose-500/10 text-slate-400 group-hover:text-rose-300 border border-white/[0.05] group-hover:border-rose-500/20 truncate transition-colors"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
                          isThisStationPlaying
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/40 scale-105 active:scale-95'
                            : 'bg-white/[0.05] group-hover:bg-rose-500/20 text-slate-300 group-hover:text-rose-300 group-hover:scale-110 active:scale-90 group-hover:shadow-[0_0_12px_rgba(244,63,94,0.35)]'
                        }`}
                      >
                        {isThisStationPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Online Quick Settings Modal */}
      {isQuickSettingsOpen && (
        <OnlineQuickSettingsModal
          isOpen={isQuickSettingsOpen}
          onClose={() => setIsQuickSettingsOpen(false)}
          onClearHistory={clearSearchHistory}
          onOpenFullSettings={onOpenSettings}
        />
      )}
    </div>
  );
};
