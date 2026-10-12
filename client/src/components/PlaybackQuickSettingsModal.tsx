import React from 'react';
import {
  Gauge,
  Sliders,
  Timer,
  X,
} from 'lucide-react';
import { type QueueEndAction, useAppSettings } from '../settings';

interface PlaybackQuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sleepTimerMinutes: number | null;
  sleepRemaining: number | null;
  onSetSleepTimer: (min: number | null) => void;
  playbackRate: number;
  onSetPlaybackRate: (rate: number) => void;
  onOpenFullSettings?: () => void;
}

export const PlaybackQuickSettingsModal: React.FC<PlaybackQuickSettingsModalProps> = ({
  isOpen,
  onClose,
  sleepTimerMinutes,
  sleepRemaining,
  onSetSleepTimer,
  playbackRate,
  onSetPlaybackRate,
  onOpenFullSettings,
}) => {
  const { settings, updateSettings } = useAppSettings();

  if (!isOpen) return null;

  const speeds = [0.75, 1.0, 1.25, 1.5, 2.0];
  const seekSteps: (5 | 10 | 15 | 30)[] = [5, 10, 15, 30];

  const formatSleep = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-[#0b0c13] border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Настройки плеера и очереди</h3>
              <p className="text-[11px] text-slate-400">Скорость, таймер сна, шаг перемотки</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex flex-col gap-4">
          {/* 1. Playback Speed */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                <span>Скорость воспроизведения</span>
              </div>
              <span className="font-mono text-cyan-400 font-bold">{playbackRate}x</span>
            </div>

            <div className="flex items-center gap-1.5">
              {speeds.map((rate) => (
                <button
                  key={rate}
                  onClick={() => onSetPlaybackRate(rate)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    playbackRate === rate
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] border border-white/[0.06]'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Сохранять тональность голоса (pitch)</span>
              <button
                onClick={() => updateSettings({ preservePitch: !settings.preservePitch })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.preservePitch ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.preservePitch ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 2. Sleep Timer */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-white">
                <Timer className="w-3.5 h-3.5 text-cyan-400" />
                <span>Таймер сна</span>
              </div>
              {sleepRemaining !== null && sleepRemaining > 0 && (
                <span className="font-mono text-cyan-400 animate-pulse font-semibold">
                  {formatSleep(sleepRemaining)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {[
                { min: null, label: 'Выкл' },
                { min: 15, label: '15м' },
                { min: 30, label: '30м' },
                { min: 45, label: '45м' },
                { min: 60, label: '1ч' },
              ].map((item) => (
                <button
                  key={String(item.min)}
                  onClick={() => onSetSleepTimer(item.min)}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    sleepTimerMinutes === item.min
                      ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                      : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] border border-white/[0.06]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
              <span>Плавное затухание звука в последние 15 сек</span>
              <button
                onClick={() => updateSettings({ sleepFadeOut: !settings.sleepFadeOut })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer ${
                  settings.sleepFadeOut ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.sleepFadeOut ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 3. Seek step & Queue end action */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-3">
            {/* Seek Step */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Шаг перемотки кнопками</span>
              <div className="flex items-center gap-1">
                {seekSteps.map((step) => (
                  <button
                    key={step}
                    onClick={() => updateSettings({ seekStepSeconds: step })}
                    className={`px-2 py-0.5 rounded text-[11px] font-mono transition-all ${
                      settings.seekStepSeconds === step
                        ? 'bg-cyan-500 text-slate-950 font-bold'
                        : 'bg-white/[0.04] text-slate-400 hover:text-white'
                    }`}
                  >
                    ±{step}с
                  </button>
                ))}
              </div>
            </div>

            {/* Queue End Action */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.06]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">В конце очереди воспроизведения:</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'repeat', label: 'Повторять' },
                  { id: 'stop', label: 'Остановить' },
                  { id: 'artist_flow', label: 'Авто-поток' },
                ].map((act) => (
                  <button
                    key={act.id}
                    onClick={() => updateSettings({ queueEndAction: act.id as QueueEndAction })}
                    className={`py-1.5 rounded-lg text-xs font-medium transition-all ${
                      settings.queueEndAction === act.id
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-semibold'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/[0.05]'
                    }`}
                  >
                    {act.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto-pause on call */}
            <div className="flex items-center justify-between text-[11px] text-slate-300 pt-2 border-t border-white/[0.06]">
              <div>
                <span className="font-medium text-white">Авто-пауза при звонках / гарнитуре</span>
                <p className="text-[10px] text-slate-500">Автоматически продолжать при возврате в стерео</p>
              </div>
              <button
                onClick={() => updateSettings({ autoPauseOnCall: !settings.autoPauseOnCall })}
                className={`w-8 h-4.5 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  settings.autoPauseOnCall ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full bg-white transition-transform ${
                    settings.autoPauseOnCall ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.08] bg-white/[0.02] flex items-center justify-between px-4">
          {onOpenFullSettings ? (
            <button
              onClick={() => {
                onClose();
                onOpenFullSettings();
              }}
              className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Все настройки в панели →</span>
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-xs font-semibold text-white transition-colors"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
