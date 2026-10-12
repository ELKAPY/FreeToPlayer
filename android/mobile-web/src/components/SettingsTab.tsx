import { useState } from 'react';
import {
  Check,
  Palette,
  Server,
  Sliders,
  Smartphone,
  Volume2,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import { THEMES, type ThemeName } from '../theme';
import { triggerHaptic } from '../useAudioPlayer';

interface SettingsTabProps {
  currentTheme: ThemeName;
  onSetTheme: (theme: ThemeName) => void;
  onOpenEq: () => void;
  onOpenConnect: () => void;
  isConnected: boolean;
  serverUrl: string;
}

export function SettingsTab({
  currentTheme,
  onSetTheme,
  onOpenEq,
  onOpenConnect,
  isConnected,
  serverUrl,
}: SettingsTabProps) {
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => {
    return localStorage.getItem('dj_mobile_haptic') !== 'false';
  });

  const [keepAwake, setKeepAwake] = useState<boolean>(() => {
    return localStorage.getItem('dj_mobile_awake') === 'true';
  });

  const toggleHaptic = () => {
    const next = !hapticEnabled;
    setHapticEnabled(next);
    localStorage.setItem('dj_mobile_haptic', String(next));
    if (next) triggerHaptic(20);
  };

  const toggleKeepAwake = () => {
    const next = !keepAwake;
    setKeepAwake(next);
    localStorage.setItem('dj_mobile_awake', String(next));
    triggerHaptic(15);
    const win = window as any;
    if (win.AndroidBridge?.setKeepScreenOn) {
      win.AndroidBridge.setKeepScreenOn(next);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 pb-36 flex flex-col gap-6 no-scrollbar select-none">
      {/* Title */}
      <div>
        <h2 className="text-xl font-extrabold text-white">Настройки</h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Конфигурация подключения, звука и внешнего вида
        </p>
      </div>

      {/* PC Server Connection Card */}
      <div className="flex flex-col gap-3 p-4 rounded-3xl bg-white/5 border border-white/10 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2.5 rounded-2xl border ${
                isConnected
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
            >
              {isConnected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Связь с ПК DJ Player</h3>
              <p className="text-xs text-neutral-400">
                {isConnected ? 'Подключено по локальной сети' : 'Сервер не подключен'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-black/40 border border-white/5 font-mono text-xs text-neutral-300 break-all">
          {serverUrl || 'Автоопределение (localhost / текущий хост)'}
        </div>

        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenConnect();
          }}
          className="w-full py-2.5 rounded-xl bg-[var(--accent-color)] text-black font-bold text-xs uppercase tracking-wider active:scale-95 transition shadow-lg flex items-center justify-center gap-2"
        >
          <Server className="w-4 h-4" />
          <span>Настроить подключение</span>
        </button>
      </div>

      {/* Audio & Equalizer Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-[var(--accent-color)]" />
          <h3 className="text-sm font-bold text-white">Звук и Аудиодвижок</h3>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              triggerHaptic(15);
              onOpenEq();
            }}
            className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 active:scale-98 transition text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-[var(--accent-color)]">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Hi-Fi Эквалайзер</p>
                <p className="text-[11px] text-neutral-400">10 полос, Bass Boost, пресеты</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-[var(--accent-color)]">Открыть</span>
          </button>

          {/* Haptic Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Тактильный отклик (Вибрация)</p>
                <p className="text-[11px] text-neutral-400">Haptic feedback при касаниях</p>
              </div>
            </div>
            <button
              onClick={toggleHaptic}
              className={`w-12 h-6.5 rounded-full p-1 transition duration-200 ease-in-out ${
                hapticEnabled ? 'bg-[var(--accent-color)]' : 'bg-neutral-800'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-full bg-white transition duration-200 transform ${
                  hapticEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Keep Awake Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Не выключать экран</p>
                <p className="text-[11px] text-neutral-400">Держать экран активным во время музыки</p>
              </div>
            </div>
            <button
              onClick={toggleKeepAwake}
              className={`w-12 h-6.5 rounded-full p-1 transition duration-200 ease-in-out ${
                keepAwake ? 'bg-[var(--accent-color)]' : 'bg-neutral-800'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-full bg-white transition duration-200 transform ${
                  keepAwake ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Themes Section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--accent-color)]" />
          <h3 className="text-sm font-bold text-white">Темы оформления</h3>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {Object.values(THEMES).map((theme) => {
            const isCurrent = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                onClick={() => {
                  triggerHaptic(20);
                  onSetTheme(theme.id);
                }}
                className={`flex items-center justify-between p-3 rounded-2xl border transition active:scale-98 text-left ${
                  isCurrent
                    ? 'border-[var(--accent-color)] bg-white/10'
                    : 'border-white/5 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center border border-white/20 shadow-md"
                    style={{ backgroundColor: theme.bg }}
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: theme.accent }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{theme.name}</p>
                    <p className="text-[11px] text-neutral-400">{theme.desc}</p>
                  </div>
                </div>

                {isCurrent && (
                  <Check className="w-5 h-5 text-[var(--accent-color)]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* App Info Footer */}
      <div className="text-center pt-2 pb-6 text-neutral-500 text-xs flex flex-col gap-1">
        <p className="font-bold text-neutral-400">DJ Player Mobile v1.0.0 (Android Edition)</p>
        <p className="text-[11px]">
          Web Audio Hi-Fi Engine • True-Peak Limiter • LRCLIB Lyrics
        </p>
      </div>
    </div>
  );
}
