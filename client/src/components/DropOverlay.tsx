import React from 'react';
import { UploadCloud } from 'lucide-react';

interface DropOverlayProps {
  isDraggingOver: boolean;
}

export const DropOverlay: React.FC<DropOverlayProps> = ({ isDraggingOver }) => {
  if (!isDraggingOver) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#07080c]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 border-2 border-dashed border-cyan-400 pointer-events-none transition-all duration-200">
      <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/[0.1] shadow-2xl flex flex-col items-center text-center max-w-sm">
        <div className="w-14 h-14 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-3">
          <UploadCloud className="w-7 h-7" />
        </div>
        <h3 className="text-base font-bold text-white mb-1">
          Импорт аудиофайлов
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Перетащите файлы для автоматического добавления в медиатеку (FLAC, WAV, MP3, M4A).
        </p>
      </div>
    </div>
  );
};
