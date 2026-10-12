# Руководство по архитектуре и навигации (AGENTS.MD)

FreeToPlayer (ранее DJ Player) — это настольный Hi-Fi музыкальный плеер для Windows, построенный на связке **Go backend + React/TypeScript frontend (Vite, Tailwind CSS) + WebView2**.

---

## 🧭 Быстрая навигация по структуре проекта

```
dj/
├── FreeToPlayer.exe           # Готовый скомпилированный бинарник приложения (Windows GUI)
├── DJ-Player.exe              # Бинарник для обратной совместимости ярлыков
├── Запуск FreeToPlayer.bat    # Быстрый скрипт запуска FreeToPlayer
├── Запуск DJ Player.bat       # Скрипт запуска для обратной совместимости
├── sync_yandex_live.py        # Фоновый синхронизатор плейлиста «Любимое» из Яндекс Музыки
├── yandex_token.txt           # Актуальный токен для Yandex Music API
│
├── server/                    # Backend на Go (REST API + Win32 интеграция + WebView2)
│   ├── main.go                # Точка входа: HTTP сервер (порт 29888), WebView2 окно, Win32 bindings
│   ├── storage.go             # Управление медиатекой (library.json) и сессией (state.json)
│   ├── online_music.go        # Онлайн-поиск, стриминговый прокси (Hitmo) и скачивание в 1 клик
│   ├── online_sources.go      # Мульти-источники (Deezer, SoundCloud, YouTube, Audius, VK, Яндекс)
│   ├── online_albums.py       # Резолвер каталогов и треков альбомов (Deezer, Яндекс Музыка, Audius)
│   ├── radio.go               # Онлайн-Радио (Radio Browser API 40k+ станций, жанры, топ, страны)
│   ├── radio_search.py        # Резолвер живых потоков радиостанций
│   ├── discord.go             # Нативный Discord Rich Presence (IPC Named Pipes, App ID 1557295851452502146)
│   ├── tray.go                # Системный трей Windows (Shell_NotifyIconW, кнопка Tray в шапке)
│   ├── app_identity.go        # Регистрация AppUserModelID (AUMID) для системного оверлея Windows 11
│   ├── audio_devices.go       # Перечисление аудиоустройств через Win32 winmm.dll
│   ├── fullscreen.go          # Полноэкранный режим F11 и перемещение frameless-окон
│   ├── dark_titlebar.go       # Тёмный заголовок окна DWM и установка системной иконки
│   ├── handlers.go            # Хэндлеры треков, стриминга локальных файлов, обложек с fallback
│   ├── handlers_extra.go      # Хэндлеры смены папки, экспорта M3U8 в Downloads, запуска Yandex sync
│   ├── types.go               # Модели данных Go: Track, PlaybackState, StorageStats, RadioStation
│   └── dist/                  # Встроенный статический бандл фронтенда (embed.FS)
│
├── client/                    # Frontend на React 19 + TypeScript + Tailwind CSS
│   ├── src/
│   │   ├── main.tsx           # Инициализация React приложения
│   │   ├── App.tsx            # Корневой компонент: маршрутизация вкладок, тосты, шорткаты
│   │   ├── types.ts           # Интерфейсы TypeScript: Track, PlaybackState, OnlineTrack, RadioStation
│   │   ├── api.ts             # Клиентские вызовы API (/api/*)
│   │   ├── useAudioPlayer.ts  # ЯДРО АУДИОДВИЖКА: Web Audio API граф, синхронизация, авто-пауза
│   │   ├── favorites.ts       # Сервис лайков, счётчиков прослушиваний и умных плейлистов
│   │   ├── playlists.ts       # Менеджер пользовательских плейлистов (CRUD, локальное сохранение)
│   │   ├── theme.ts           # Темы оформления (Onyx, Cyberpunk, Midnight, Dracula, Nord)
│   │   ├── mediaSession.ts    # Интеграция с Windows System Media Transport Controls (SMTC)
│   │   ├── m3u8.ts            # Генерация и экспорт плейлистов M3U8
│   │   ├── lyrics.ts          # Автопоиск синхронизированных караоке-текстов песен (LRCLIB)
│   │   └── components/
│   │       ├── Header.tsx             # Шапка: бренд FreeToPlayer, интерактивная пластинка, навигация, Tray
│   │       ├── HomeView.tsx           # Главная: консоль, спектроанализатор, интерактивная очередь с DnD
│   │       ├── CollectionView.tsx     # Медиатека: 4 вкладки (Все, Любимые, Плейлисты, Исполнители)
│   │       ├── OnlineSearchView.tsx   # Мировой поиск треков, альбомов и Онлайн-Радио (40k+ станций)
│   │       ├── SettingsView.tsx       # Настройки: устройства, EQ, сброс звука, темы, Discord RPC
│   │       ├── PlayerBar.tsx          # Нижняя панель плеера: плейбар, бейдж LIVE STREAM, громкость
│   │       ├── NowPlayingExpanded.tsx # Развернутый плеер в стиле Apple Music с караоке-текстом
│   │       └── TagEditorModal.tsx     # Модальное окно редактирования тегов (React Portal)
│   └── dist/                  # Скомпилированный фронтенд (Vite build)
│
└── data/                      # Папка пользовательских данных
    ├── audio/                 # Локальные аудиофайлы MP3/FLAC
    ├── covers/                # Локальные обложки треков (600x600 JPG)
    ├── library.json           # База данных локальной медиатеки
    ├── state.json             # Полный снимок состояния сессии и настроек
    ├── deleted_tracks.json    # Чёрный список удалённых композиций
    └── app_profile/           # Изолированный профиль WebView2
```

---

## ⚡ Ключевые архитектурные решения

### 1. Звуковой движок (`client/src/useAudioPlayer.ts`)
- **Схема Web Audio API:**  
  `<audio>` ➔ `MediaElementAudioSourceNode` ➔ `preampGain` (компенсация клиппинга EQ) ➔ `10-band BiquadFilterNodes` ➔ `DynamicsCompressorNode` (-0.5 dBFS) ➔ `AudioContext.destination` + `MediaStreamDestination` + `AnalyserNode`.
- **Синхронный мульти-вывод звука:**  
  Одновременная отправка звука на несколько выходов (например, наушники + колонки).
- **Авто-пауза при входящем звонке и авто-продолжение:**  
  Отслеживание `devicechange` для гарнитур Hands-Free и возврат при переключении в стерео (A2DP).

### 2. Discord Rich Presence (`server/discord.go`)
- Нативный протокол Windows Named Pipes (`\\.\pipe\discord-ipc-0...9`).
- Application ID: `1557295851452502146` (`FreeToPlayer`).
- Автоматический подбор интернет-обложек альбомов в высоком разрешении для локальных и онлайн-треков.

### 3. Онлайн-Радио со всего мира (`server/radio.go`, `client/src/components/OnlineSearchView.tsx`)
- Интеграция с открытой мировой базой **Radio Browser API** (более 40 000 радиостанций).
- Фильтры по странам (Россия, США, Европа, Азия) и жанрам (Рок, Метал, Lo-Fi, Synthwave, Джаз, Классика, EDM, Ретро).
- Индикатор `LIVE STREAM` на плейбаре и живой спектроанализатор.

### 4. Вкладки медиатеки и плейлисты (`client/src/playlists.ts`, `client/src/components/CollectionView.tsx`)
- 4 чистых раздела: **«Все»**, **«Любимые»**, **«Плейлисты»**, **«Исполнители»**.
- Смарт-подборки («Топ прослушиваний», «Недавно добавленные», «Забытые фавориты») объединены внутри раздела «Плейлисты».
- Полноценный менеджер персональных плейлистов.

---

## 🛠️ Команды сборки и разработки

### Сборка всего проекта одной цепочкой:
```powershell
# 1. Сборка фронтенда
cd client
npm run build

# 2. Копирование собранного дистрибутива в сервер
cd ..
Remove-Item -Path "server\dist\assets\*" -Force -ErrorAction SilentlyContinue
Copy-Item -Path "client\dist\*" -Destination "server\dist" -Recurse -Force

# 3. Компиляция бинарников Go
cd server
go build -ldflags="-H windowsgui" -o "..\FreeToPlayer.exe" .
go build -ldflags="-H windowsgui" -o "..\DJ-Player.exe" .
go build -ldflags="-H windowsgui" -o "dj-server.exe" .
cd ..
```

### Запуск:
- Двойной клик по **`FreeToPlayer.exe`** или файл **`Запуск FreeToPlayer.bat`**.
- В режиме чистого сервера: `server\dj-server.exe --server-only`.
