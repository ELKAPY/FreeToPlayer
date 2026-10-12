import { Home, Library, Search, Settings } from 'lucide-react';
import type { MobileTab } from '../types';
import { triggerHaptic } from '../useAudioPlayer';

interface BottomNavProps {
  currentTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
}

export function BottomNav({ currentTab, onChangeTab }: BottomNavProps) {
  const tabs = [
    { id: 'home' as MobileTab, label: 'Главная', icon: Home },
    { id: 'collection' as MobileTab, label: 'Медиатека', icon: Library },
    { id: 'search' as MobileTab, label: 'Поиск', icon: Search },
    { id: 'settings' as MobileTab, label: 'Настройки', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-main)]/95 backdrop-blur-2xl border-t border-[var(--border-color)] safe-bottom select-none">
      <div className="flex items-center justify-around h-15 px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                triggerHaptic(12);
                onChangeTab(tab.id);
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 ${
                isActive ? 'text-[var(--accent-color)]' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110' : 'scale-100'
                  }`}
                />
                {isActive && (
                  <span
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[var(--accent-color)]"
                    style={{ boxShadow: '0 0 6px var(--accent-color)' }}
                  />
                )}
              </div>
              <span
                className={`text-[10px] mt-1 font-medium tracking-tight ${
                  isActive ? 'font-bold' : ''
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
