import React, { useEffect, useRef } from 'react';
import { type VisualizerStyle, useAppSettings } from '../settings';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  onClickStyleCycle?: () => void;
}

export const Visualizer: React.FC<VisualizerProps> = ({
  analyser,
  isPlaying,
  onClickStyleCycle,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { settings, updateSettings } = useAppSettings();

  const {
    visualizerEnabled,
    visualizerStyle,
    visualizerBars,
    visualizerSensitivity,
  } = settings;

  const handleCycleStyle = () => {
    if (onClickStyleCycle) {
      onClickStyleCycle();
      return;
    }
    const styles: VisualizerStyle[] = ['bars', 'wave', 'mirror', 'dots'];
    const nextIdx = (styles.indexOf(visualizerStyle) + 1) % styles.length;
    updateSettings({ visualizerStyle: styles[nextIdx] });
  };

  useEffect(() => {
    if (!visualizerEnabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const barCount = visualizerBars || 36;
    const sens = visualizerSensitivity || 1.0;
    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 64);

    const render = () => {
      animationId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      }

      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, '#8b5cf6'); // purple-500
      gradient.addColorStop(0.5, '#06b6d4'); // cyan-500
      gradient.addColorStop(1, '#f43f5e'); // rose-500

      if (visualizerStyle === 'wave') {
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = gradient;

        const points = barCount;
        const sliceWidth = width / Math.max(1, points - 1);

        for (let i = 0; i < points; i++) {
          let value = 0;
          if (analyser && isPlaying) {
            const index = Math.floor((i / points) * (dataArray.length * 0.75));
            value = Math.min(255, (dataArray[index] || 0) * sens);
          } else {
            value = Math.sin(Date.now() * 0.003 + i * 0.25) * 14 + 20;
          }

          const x = i * sliceWidth;
          const y = height - Math.max(4, (value / 255) * (height - 10));

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            const prevX = (i - 1) * sliceWidth;
            const cx = (prevX + x) / 2;
            ctx.quadraticCurveTo(prevX, y, cx, y);
          }
        }
        ctx.stroke();

        // Fill subtle glow under wave
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        const fillGrad = ctx.createLinearGradient(0, 0, 0, height);
        fillGrad.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
        fillGrad.addColorStop(1, 'rgba(139, 92, 246, 0.02)');
        ctx.fillStyle = fillGrad;
        ctx.fill();
        return;
      }

      const totalSpacing = barCount > 40 ? 2.5 : 4;
      const barWidth = Math.max(2, (width - (barCount - 1) * totalSpacing) / barCount);

      for (let i = 0; i < barCount; i++) {
        let value = 0;
        if (analyser && isPlaying) {
          const index = Math.floor((i / barCount) * (dataArray.length * 0.75));
          value = Math.min(255, (dataArray[index] || 0) * sens);
        } else {
          value = Math.sin(Date.now() * 0.003 + i * 0.25) * 8 + 12;
        }

        const x = i * (barWidth + totalSpacing);

        if (visualizerStyle === 'mirror') {
          const halfH = height / 2;
          const h = Math.max(2, (value / 255) * (halfH - 2));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, halfH - h, barWidth, h * 2, 2);
          ctx.fill();
        } else if (visualizerStyle === 'dots') {
          const barHeight = Math.max(4, (value / 255) * (height - 8));
          const y = height - barHeight;
          const radius = Math.max(2, barWidth / 2);

          // Trail
          ctx.fillStyle = 'rgba(6, 182, 212, 0.18)';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();

          // Glowing orb at peak
          ctx.fillStyle = '#22d3ee';
          ctx.beginPath();
          ctx.arc(x + barWidth / 2, y + radius, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Default 'bars'
          const barHeight = Math.max(3, (value / 255) * (height - 8));
          const y = height - barHeight;

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 1, 1]);
          ctx.fill();

          if (barHeight > 10) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, 2, 1);
            ctx.fill();
          }
        }
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isPlaying, visualizerEnabled, visualizerStyle, visualizerBars, visualizerSensitivity]);

  if (!visualizerEnabled) {
    return null;
  }

  const styleLabels: Record<VisualizerStyle, string> = {
    bars: 'Столбики',
    wave: 'Волна',
    mirror: 'Симметрия',
    dots: 'Пики',
  };

  return (
    <div
      onClick={handleCycleStyle}
      title={`Спектроанализатор (${styleLabels[visualizerStyle]}) — кликните для смены стиля`}
      className="w-full h-16 relative flex items-center justify-center overflow-hidden cursor-pointer group rounded-xl hover:bg-white/[0.02] transition-colors"
    >
      <canvas
        ref={canvasRef}
        width={480}
        height={64}
        className="w-full h-full object-contain"
      />
      <span className="absolute top-1 right-2 text-[9px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 px-1.5 py-0.5 rounded">
        {styleLabels[visualizerStyle]}
      </span>
    </div>
  );
};
