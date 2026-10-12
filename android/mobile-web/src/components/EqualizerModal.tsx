import { Sliders, X } from 'lucide-react';
import { EQ_FREQUENCIES, EQ_PRESETS, triggerHaptic } from '../useAudioPlayer';

interface EqualizerModalProps {
  eqGains: number[];
  onSetBand: (index: number, gain: number) => void;
  onApplyPreset: (presetName: string) => void;
  onClose: () => void;
}

export function EqualizerModal({
  eqGains,
  onSetBand,
  onApplyPreset,
  onClose,
}: EqualizerModalProps) {
  const formatFreq = (freq: number) => {
    return freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-md animate-in fade-in select-none">
      <div className="w-full bg-neutral-900 border-t border-white/10 rounded-t-3xl p-5 safe-bottom max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-[var(--accent-color)]" />
            <h3 className="text-base font-bold text-white">Hi-Fi Эквалайзер (10 полос)</h3>
          </div>
          <button
            onClick={() => {
              triggerHaptic(15);
              onClose();
            }}
            className="p-1.5 text-neutral-400 hover:text-white rounded-full bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Presets Strip */}
        <div className="flex items-center gap-2 py-4 overflow-x-auto no-scrollbar">
          {Object.keys(EQ_PRESETS).map((preset) => (
            <button
              key={preset}
              onClick={() => onApplyPreset(preset)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5 active:scale-95 transition flex-shrink-0"
            >
              {preset === 'bass' ? 'Bass Boost' : preset}
            </button>
          ))}
        </div>

        {/* 10 Vertical Sliders */}
        <div className="flex-1 flex items-center justify-between gap-1 py-6 px-1 overflow-x-auto no-scrollbar">
          {EQ_FREQUENCIES.map((freq, idx) => {
            const gain = eqGains[idx] || 0;
            return (
              <div key={freq} className="flex-1 min-w-[28px] flex flex-col items-center gap-2">
                <span className="text-[10px] font-mono text-neutral-400">
                  {gain > 0 ? `+${gain}` : gain}
                </span>

                {/* Vertical slider input container */}
                <div className="h-40 flex items-center justify-center relative">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={gain}
                    onChange={(e) => onSetBand(idx, parseFloat(e.target.value))}
                    className="h-32 w-1.5 bg-white/15 rounded-full appearance-none cursor-pointer accent-[var(--accent-color)]"
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                    }}
                  />
                </div>

                <span className="text-[10px] font-bold text-neutral-300 font-mono">
                  {formatFreq(freq)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Reset button */}
        <div className="pt-2">
          <button
            onClick={() => onApplyPreset('flat')}
            className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-neutral-300 active:scale-95 transition"
          >
            Сбросить на Flat (0 dB)
          </button>
        </div>
      </div>
    </div>
  );
}
