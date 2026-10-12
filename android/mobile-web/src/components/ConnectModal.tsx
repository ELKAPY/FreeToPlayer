import { useState } from 'react';
import { Check, HelpCircle, Loader2, Server, Wifi, WifiOff, X } from 'lucide-react';
import { checkServerConnection, getServerUrl, setServerUrl } from '../api';
import { triggerHaptic } from '../useAudioPlayer';

interface ConnectModalProps {
  onClose: () => void;
  onConnected: () => void;
}

export function ConnectModal({ onClose, onConnected }: ConnectModalProps) {
  const [urlInput, setUrlInput] = useState<string>(() => getServerUrl());
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);

  const handleTestAndSave = async () => {
    triggerHaptic(15);
    setIsTesting(true);
    setTestResult(null);

    const ok = await checkServerConnection(urlInput);
    setIsTesting(false);

    if (ok) {
      setTestResult('success');
      setServerUrl(urlInput);
      triggerHaptic(30);
      setTimeout(() => {
        onConnected();
        onClose();
      }, 600);
    } else {
      setTestResult('fail');
      triggerHaptic(50);
    }
  };

  const handleUseCurrentHost = () => {
    triggerHaptic(10);
    if (typeof window !== 'undefined' && window.location.protocol.startsWith('http')) {
      setUrlInput(window.location.origin);
    } else {
      setUrlInput('http://192.168.1.100:29888');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="w-full max-w-md bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-[var(--accent-color)] border border-cyan-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Связь с ПК DJ Player</h3>
              <p className="text-xs text-neutral-400">Стриминг и управление медиатекой</p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic(10);
              onClose();
            }}
            className="p-1.5 text-neutral-400 hover:text-white rounded-full bg-white/5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* IP URL Input */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-neutral-300">
            Адрес сервера DJ Player (IP и порт):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="http://192.168.1.100:29888"
              className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-[var(--accent-color)]"
            />
          </div>

          <button
            onClick={handleUseCurrentHost}
            className="text-[11px] text-[var(--accent-color)] hover:underline self-start mt-0.5"
          >
            Использовать адрес текущего хоста
          </button>
        </div>

        {/* Test Result Indicator */}
        {testResult === 'success' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
            <Check className="w-4 h-4" />
            <span>Сервер успешно подключен! Медиатека синхронизирована.</span>
          </div>
        )}

        {testResult === 'fail' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            <WifiOff className="w-4 h-4" />
            <span>Не удалось связаться с сервером. Проверьте IP и сеть Wi-Fi.</span>
          </div>
        )}

        {/* Helpful instructions */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/5 text-xs text-neutral-400 leading-relaxed flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-bold text-neutral-300">
            <HelpCircle className="w-4 h-4 text-[var(--accent-color)]" />
            <span>Как подключить телефон:</span>
          </div>
          <p>
            1. Компьютер и телефон должны быть подключены к одной Wi-Fi сети.
          </p>
          <p>
            2. В DJ Player на ПК откройте <b>Настройки → Подключение телефона</b> или посмотрите IP в консоли.
          </p>
          <p>
            3. Введите адрес выше (например: <code className="text-white">http://192.168.1.50:29888</code>).
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleTestAndSave}
            disabled={isTesting}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent-color)] hover:opacity-90 active:scale-95 text-black font-bold text-xs uppercase tracking-wider transition disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Проверка...</span>
              </>
            ) : (
              <>
                <Wifi className="w-4 h-4" />
                <span>Подключить и сохранить</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
