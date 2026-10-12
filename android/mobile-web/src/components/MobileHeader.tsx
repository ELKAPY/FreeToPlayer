import { useState } from 'react';
import { Disc3, Sliders, Wifi, WifiOff } from 'lucide-react';
import { triggerHaptic } from '../useAudioPlayer';

interface MobileHeaderProps {
  isPlaying: boolean;
  isConnected: boolean;
  serverUrl: string;
  onOpenConnect: () => void;
  onOpenEq: () => void;
}

export function MobileHeader({
  isPlaying,
  isConnected,
  serverUrl,
  onOpenConnect,
  onOpenEq,
}: MobileHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between px-4 py-3 safe-top border-b border-[var(--border-color)] bg-[var(--bg-main)]/90 backdrop-blur-xl">
      {/* Brand & Logo */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/10 border border-cyan-500/20">
          <Disc3
            className={`w-5 h-5 text-[var(--accent-color)] ${
              isPlaying ? 'animate-spin' : ''
            }`}
            style={{ animationDuration: '4s' }}
          />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-wide uppercase text-white flex items-center gap-1.5">
            DJ Player
            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-cyan-500/20 text-[var(--accent-color)]">
              MOBILE
            </span>
          </h1>
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Equalizer Quick Button */}
        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenEq();
          }}
          className="p-2 rounded-xl text-neutral-300 hover:text-white bg-white/5 active:scale-95 transition"
          title="Эквалайзер"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Server Connection Status Pill */}
        <button
          onClick={() => {
            triggerHaptic(15);
            onOpenConnect();
          }}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 ${
            isConnected
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
          }`}
          title={isConnected ? `Подключено: ${serverUrl || 'Локально'}` : 'Сервер офлайн. Нажмите для настройки'}
        >
          {isConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ПК онлайн</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 animate-pulse" />
              <span>Офлайн</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
}
