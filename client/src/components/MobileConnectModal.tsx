import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  ExternalLink,
  Info,
  QrCode,
  RefreshCw,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';

interface NetworkInterface {
  name: string;
  ip: string;
  isPrimary: boolean;
  type: string; // 'wifi' | 'ethernet' | 'virtual' | 'lan'
  isVirtual: boolean;
}

interface NetworkInfoResponse {
  port: number;
  primaryIp: string;
  ips: string[];
  interfaces?: NetworkInterface[];
  mobileUrl?: string;
  webUrl?: string;
}

interface MobileConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfoResponse | null>(null);
  const [selectedIp, setSelectedIp] = useState<string>('');
  const [targetPath, setTargetPath] = useState<'/mobile' | '/'>('/mobile');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Load network info from API
  const fetchNetworkInfo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data: NetworkInfoResponse = await res.json();
        setNetworkInfo(data);
        const bestIp = data.primaryIp || (data.ips && data.ips[0]) || '127.0.0.1';
        setSelectedIp(bestIp);
      }
    } catch {
      // Fallback
      setSelectedIp('127.0.0.1');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNetworkInfo();
    }
  }, [isOpen]);

  const activePort = networkInfo?.port || 29888;
  const currentUrl = `http://${selectedIp || '127.0.0.1'}:${activePort}${targetPath === '/mobile' ? '/mobile' : ''}`;

  // Generate QR code whenever URL changes
  useEffect(() => {
    if (!currentUrl) return;
    let isCancelled = false;

    QRCode.toDataURL(currentUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: '#070913',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!isCancelled) {
          setQrDataUrl(url);
        }
      })
      .catch((err) => {
        console.error('QR generation error:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [currentUrl]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(currentUrl).then(() => {
      setCopied(true);
      if (onToast) onToast('Ссылка скопирована в буфер обмена');
      setTimeout(() => setCopied(false), 2200);
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-[#090b12] border border-white/[0.1] shadow-2xl overflow-hidden flex flex-col animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/[0.08] flex items-center justify-between gap-3 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shadow-sm">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Подключение с телефона</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-semibold">
                  Wi-Fi
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Управление плеером и воспроизведение через браузер
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col items-center gap-4 overflow-y-auto max-h-[80vh]">
          {/* IP selector / Interface Picker */}
          {networkInfo && networkInfo.interfaces && networkInfo.interfaces.length > 1 && (
            <div className="w-full flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-medium">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Сетевой адаптер ПК:</span>
                </span>
                <button
                  onClick={fetchNetworkInfo}
                  className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Обновить</span>
                </button>
              </div>

              <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                {networkInfo.interfaces.map((iface) => {
                  const isSelected = selectedIp === iface.ip;
                  return (
                    <button
                      key={iface.ip}
                      onClick={() => setSelectedIp(iface.ip)}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-500/50 text-white shadow-sm'
                          : 'bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            isSelected ? 'bg-cyan-400 animate-ping' : 'bg-slate-600'
                          }`}
                        />
                        <span className="font-semibold text-white font-mono">{iface.ip}</span>
                        <span className="text-[11px] text-slate-400 truncate">({iface.name})</span>
                      </div>

                      {iface.isPrimary && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold shrink-0 ml-2">
                          Wi-Fi / LAN
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target App Switcher: Mobile Web vs Full Player */}
          <div className="w-full flex items-center justify-center p-1 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
            <button
              onClick={() => setTargetPath('/mobile')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                targetPath === '/mobile'
                  ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>Мобильный пульт</span>
            </button>
            <button
              onClick={() => setTargetPath('/')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                targetPath === '/'
                  ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ExternalLink className="w-4 h-4" />
              <span>Полный плеер</span>
            </button>
          </div>

          {/* QR Code Container */}
          <div className="relative p-3.5 bg-white rounded-2xl shadow-xl flex items-center justify-center group hover:scale-[1.02] transition-transform">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="QR Code for mobile connection"
                className="w-56 h-56 rounded-lg object-contain"
              />
            ) : (
              <div className="w-56 h-56 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
                <span className="text-xs">Генерация QR-кода...</span>
              </div>
            )}
          </div>

          {/* URL with Copy Button */}
          <div className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
            <span className="text-xs font-mono text-cyan-300 truncate flex-1 select-all">
              {currentUrl}
            </span>

            <button
              onClick={handleCopyLink}
              title="Скопировать ссылку"
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0 ${
                copied
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-white/[0.08] hover:bg-white/[0.14] text-white'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Копировать</span>
                </>
              )}
            </button>

            <a
              href={currentUrl}
              target="_blank"
              rel="noreferrer"
              title="Открыть в браузере на этом ПК"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          {/* Step-by-step instructions */}
          <div className="w-full p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col gap-2 text-xs text-slate-300">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Info className="w-4 h-4 text-cyan-400" />
              <span>Как подключиться:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-relaxed">
              <li>
                Убедитесь, что смартфон и компьютер подключены к{' '}
                <strong className="text-slate-200">одной сети Wi-Fi</strong>.
              </li>
              <li>
                Наведите камеру смартфона на <strong className="text-slate-200">QR-код</strong>{' '}
                выше и нажмите на появившуюся ссылку.
              </li>
              <li>
                Управляйте треками, громкостью и плейлистами прямо со смартфона без проводов!
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
