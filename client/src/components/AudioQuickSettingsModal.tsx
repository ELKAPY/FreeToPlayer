import React from 'react';
import {
  Check,
  Headphones,
  RotateCcw,
  Sliders,
  Volume2,
  X,
} from 'lucide-react';
import { useAppSettings } from '../settings';
import { type EQPresetName } from '../useAudioPlayer';

interface AudioQuickSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  eqPreset: EQPresetName;
  eqGains: number[];
  eqEnabled: boolean;
  isNormalizationEnabled: boolean;
  crossfadeSeconds: number;
  audioDevices: MediaDeviceInfo[];
  selectedDevices: string[];
  onSetEqualizerPreset: (preset: EQPresetName) => void;
  onToggleEqEnabled: (enabled: boolean) => void;
  onToggleNormalization: () => void;
  onSetCrossfade: (sec: number) => void;
  onSetAudioDevice: (id: string) => Promise<boolean>;
  onRecoverAudio: () => Promise<void>;
  onOpenFullSettings?: () => void;
}

export const AudioQuickSettingsModal: React.FC<AudioQuickSettingsModalProps> = ({
  isOpen,
  onClose,
  eqPreset,
  eqEnabled,
  isNormalizationEnabled,
  crossfadeSeconds,
  audioDevices,
  selectedDevices,
  onSetEqualizerPreset,
  onToggleEqEnabled,
  onToggleNormalization,
  onSetCrossfade,
  onSetAudioDevice,
  onRecoverAudio,
  onOpenFullSettings,
}) => {
  const { settings, updateSettings } = useAppSettings();

  if (!isOpen) return null;

  const presets: { id: EQPresetName; name: string }[] = [
    { id: 'flat', name: 'Flat' },
    { id: 'rock', name: 'Рок' },
    { id: 'metal', name: 'Метал' },
    { id: 'electronic', name: 'Dance' },
    { id: 'hiphop', name: 'Bass' },
    { id: 'acoustic', name: 'Акустика' },
    { id: 'vocal', name: 'Вокал' },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-2xl bg-[#0b0c13] border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Быстрые настройки звука</h3>
              <p className="text-[11px] text-slate-400">Эквалайзер, баланс, ReplayGain и устройства</p>
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
          {/* 1. Equalizer toggle & presets */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white">10-полосный эквалайзер</span>
                <span className="text-[10px] font-mono text-cyan-400 uppercase">
                  {eqEnabled ? eqPreset : 'Выключен'}
                </span>
              </div>
              <button
                onClick={() => onToggleEqEnabled(!eqEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer ${
                  eqEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    eqEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Presets chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {presets.map((p) => {
                const isSelected = eqPreset === p.id && eqEnabled;
                return (
                  <button
                    key={p.id}
                    disabled={!eqEnabled}
                    onClick={() => onSetEqualizerPreset(p.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap disabled:opacity-40 ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] border border-white/[0.06]'
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Stereo Balance L/R */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white">Стерео баланс (L / R)</span>
              <span className="font-mono text-slate-400">
                {settings.stereoBalance === 0
                  ? 'Центр'
                  : settings.stereoBalance < 0
                  ? `L ${Math.round(Math.abs(settings.stereoBalance) * 100)}%`
                  : `R ${Math.round(settings.stereoBalance * 100)}%`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-500">L</span>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={settings.stereoBalance}
                onChange={(e) => updateSettings({ stereoBalance: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-[10px] font-mono text-slate-500">R</span>
              {settings.stereoBalance !== 0 && (
                <button
                  onClick={() => updateSettings({ stereoBalance: 0 })}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-slate-400 hover:text-white"
                >
                  0
                </button>
              )}
            </div>
          </div>

          {/* 3. ReplayGain & Crossfade in a 2-col grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-white">Нормализация</h4>
                <p className="text-[10px] text-slate-400">Пиковый лимитер ReplayGain</p>
              </div>
              <button
                onClick={onToggleNormalization}
                className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${
                  isNormalizationEnabled ? 'bg-cyan-500' : 'bg-white/[0.1]'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                    isNormalizationEnabled ? 'translate-x-4.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Кроссфейд</span>
                <span className="font-mono text-cyan-400 font-bold">
                  {crossfadeSeconds === 0 ? 'Выкл' : `${crossfadeSeconds}с`}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="6"
                step="1"
                value={crossfadeSeconds}
                onChange={(e) => onSetCrossfade(parseInt(e.target.value, 10))}
                className="w-full h-1 bg-white/[0.1] rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
            </div>
          </div>

          {/* 4. Output devices selection (Supports choosing ANY number of outputs simultaneously) */}
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white">Вывод звука (мульти-устройства)</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allIds = ['default', ...audioDevices.map((d) => d.deviceId)];
                    allIds.forEach((id) => {
                      if (!selectedDevices.includes(id)) {
                        onSetAudioDevice(id);
                      }
                    });
                  }}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                >
                  Все
                </button>
                <button
                  onClick={async () => {
                    await onRecoverAudio();
                  }}
                  className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Сброс</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
              {/* Default */}
              <div
                onClick={() => onSetAudioDevice('default')}
                className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                  selectedDevices.includes('default')
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-white font-medium'
                    : 'bg-black/20 border-white/[0.04] text-slate-300 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span className="truncate">По умолчанию (Windows)</span>
                </div>
                {selectedDevices.includes('default') && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
              </div>

              {audioDevices.map((d) => {
                const isSelected = selectedDevices.includes(d.deviceId);
                return (
                  <div
                    key={d.deviceId}
                    onClick={() => onSetAudioDevice(d.deviceId)}
                    className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-white font-medium'
                        : 'bg-black/20 border-white/[0.04] text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate" title={d.label}>{d.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                  </div>
                );
              })}
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
              <span>Все настройки звука в панели →</span>
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
