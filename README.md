# PuzzleHub

PuzzleHub — мультиязычный сайт и Telegram Mini App с играми-головоломками,
облачными сохранениями и синхронизацией прогресса между устройствами.

В проект входят пять игр:

- **Пятнашки** — поля 3×3, 4×4 и 5×5;
- **Судоку** — три сложности, заметки и подсветка конфликтов;
- **2048** — управление свайпами и клавиатурой, рекорд и продолжение после 2048;
- **Мемори** — поля 3×4, 4×4 и 4×5;
- **Numsolis** — карточный пасьянс со слияниями, три сложности и проверенные на решаемость раздачи.

Интерфейс доступен на русском и английском языках: `/ru` и `/en`.

> Инструкции по деплою находятся в [DEPLOY.md](./DEPLOY.md), а правила работы
> ИИ-агентов с кодовой базой — в [AGENTS.md](./AGENTS.md).

## Содержание

- [Возможности](#возможности)
- [Технологии](#технологии)
- [Быстрый старт](#быстрый-старт)
- [Разработка на хосте](#вариант-1-разработка-на-хосте)
- [Разработка через Docker](#вариант-2-разработка-через-docker)
- [Переменные окружения](#переменные-окружения)
- [Полезные команды](#полезные-команды)
- [Тестирование](#тестирование)
- [Telegram Mini Apps](#telegram-mini-apps)
- [Архитектура](#архитектура)
- [API](#api)
- [Деплой](#деплой)
- [Решение частых проблем](#решение-частых-проблем)

## Возможности

- адаптивный mobile-first интерфейс в теме **Auralis**;
- локализованные маршруты `/ru/...` и `/en/...`;
- гостевой профиль без обязательной регистрации;
- регистрация и вход по email без потери гостевого прогресса;
- вход через Telegram Mini Apps;
- автосохранение каждого значимого хода;
- продолжение партии после перезагрузки страницы;
- синхронизация сохранений между устройствами;
- одноразовая ссылка и QR-код для переноса сессии на другое устройство;
- разрешение конфликтов при одновременной игре на нескольких устройствах;
- собственная аналитика без внешних трекеров;
- защищённый административный дашборд;
- health-check для мониторинга;
- unit-, integration- и e2e-тесты;
- standalone-сборка и автоматизированный релиз через GitHub Actions.

## Технологии

- **Next.js 16** App Router и **React 19**;
- **TypeScript**;
- **TanStack Query** для серверного состояния;
- **Zustand** для состояния игр;
- **Tailwind CSS 4** и **shadcn/ui**;
- **Framer Motion** для анимаций;
- **React Hook Form** и **Zod**;
- **Prisma 7** и **SQLite** через `better-sqlite3`;
- **Vitest** для unit- и integration-тестов;
- **Playwright** для e2e-тестов.

## Быстрый старт

Для разработки можно запустить проект двумя способами:

1. **на хосте** — быстрее устанавливаются зависимости и запускаются тесты;
2. **через Docker Compose** — Node.js и зависимости изолированы в контейнере.

В обоих случаях приложение будет доступно по адресу:

- <http://localhost:3000> — редирект на локаль браузера;
- <http://localhost:3000/ru> — русская версия;
- <http://localhost:3000/en> — английская версия;
- <http://localhost:3000/ru/games> — хаб игр.

## Вариант 1. Разработка на хосте

### Требования

- **Node.js 22.x**;
- npm, поставляемый вместе с Node.js;
- Git.

Node.js 22 рекомендуется использовать и локально, и в CI/production:
`better-sqlite3` является нативным модулем, поэтому смена major-версии Node.js
может потребовать его пересборки.

Проверьте версии:

```bash
node --version
npm --version
```

### 1. Клонирование и настройка окружения

```bash
git clone git@github.com:2hardume/puzzlehub.git
cd puzzlehub
cp .env.example .env
```

Репозиторий приватный, поэтому для клонирования должен быть настроен доступ к
нему через SSH или GitHub token.

Для обычной локальной разработки достаточно значения `SESSION_SECRET` из
примера. Telegram-вход и админка включаются отдельными переменными — подробнее
в разделе [«Переменные окружения»](#переменные-окружения).

### 2. Установка зависимостей

```bash
npm install
```

В `.npmrc` уже задано `legacy-peer-deps=true`. Не нужно добавлять
`--legacy-peer-deps` вручную и не следует удалять эту настройку: она нужна из-за
peer dependency сторонних библиотек.

Если Prisma Client ещё не сгенерирован или была изменена Prisma-схема:

```bash
npx prisma generate
```

### 3. Создание локальной базы данных

```bash
npx prisma db push
```

Если `DATABASE_URL` не указан, база будет создана в `prisma/dev.db`.
Команду нужно повторять после изменений `prisma/schema.prisma`.

### 4. Запуск dev-сервера

```bash
npm run dev
```

Next.js запустится на <http://localhost:3000>. Изменения в исходниках
подхватываются автоматически.

### Полная последовательность

```bash
git clone git@github.com:2hardume/puzzlehub.git
cd puzzlehub
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run dev
```

## Вариант 2. Разработка через Docker

### Требования

- Docker Engine или Docker Desktop;
- Docker Compose v2, вызываемый командой `docker compose`.

Node.js и npm на хосте для этого варианта не требуются.

### Рекомендуемый запуск через Docker Compose

```bash
git clone git@github.com:2hardume/puzzlehub.git
cd puzzlehub
cp .env.example .env
docker compose up --build
```

При старте контейнер:

1. устанавливает и синхронизирует npm-зависимости;
2. выполняет `npx prisma db push`;
3. запускает `npm run dev`;
4. публикует приложение на <http://localhost:3000>.

Исходники подключены в контейнер через bind mount, поэтому hot reload работает
без пересборки образа. Локальная SQLite-база находится в `prisma/dev.db` на
хосте и сохраняется после остановки контейнера.

Запуск в фоне:

```bash
docker compose up --build -d
docker compose logs -f web
```

Остановка:

```bash
docker compose down
```

После изменения `package.json` обычного перезапуска, как правило, достаточно:
контейнер выполняет `npm install` при каждом старте. Если Docker сохранил старый
volume и появилась ошибка `Module not found`, пересоздайте volumes зависимостей:

```bash
docker compose down -v
docker compose up --build
```

Эта команда удаляет контейнерные volumes `node_modules` и `.next`, но не
удаляет `prisma/dev.db`, потому что база лежит в каталоге проекта на хосте.

### Команды внутри контейнера

Открыть shell:

```bash
docker compose exec web sh
```

Запустить проверки в работающем контейнере:

```bash
docker compose exec web npm test
docker compose exec web npx eslint src tests
docker compose exec web npm run build
```

Выполнить разовую команду в отдельном контейнере:

```bash
docker compose run --rm web npx prisma db push
docker compose run --rm web npm test
```

### Запуск только через `docker run`

Docker Compose предпочтительнее, поскольку volumes и переменные уже описаны в
`compose.yaml`. Если Compose недоступен, эквивалентный запуск выглядит так:

```bash
docker build -f Dockerfile.dev -t puzzlehub-dev .

docker run --rm -it \
  --name puzzlehub-dev \
  -p 3000:3000 \
  --env-file .env \
  -v "$PWD:/app" \
  -v puzzlehub_node_modules:/app/node_modules \
  -v puzzlehub_next_cache:/app/.next \
  puzzlehub-dev
```

Не подключайте только `-v "$PWD:/app"` без отдельного volume для
`/app/node_modules`: bind mount скроет зависимости из образа, и запуск завершится
ошибкой `next: not found`.

## Переменные окружения

Создайте локальный файл из примера:

```bash
cp .env.example .env
```

| Переменная | Обязательность | Назначение |
|---|---|---|
| `SESSION_SECRET` | обязательна в production | Подпись cookie-сессии. Для production сгенерируйте `openssl rand -base64 48` |
| `DATABASE_URL` | необязательна | URL SQLite. По умолчанию используется `prisma/dev.db` |
| `TELEGRAM_BOT_TOKEN` | необязательна | API token того же бота, через которого открывается Mini App |
| `ADMIN_KEY` | необязательна | Включает `/{locale}/admin` и защищает `/api/admin/stats` |

Пример локальной конфигурации:

```dotenv
SESSION_SECRET=local-development-secret
DATABASE_URL=file:/absolute/path/to/puzzlehub/prisma/dev.db
TELEGRAM_BOT_TOKEN=123456789:AAF_your_bot_token
ADMIN_KEY=local-admin-key
```

Если абсолютный путь к базе не нужен, не указывайте `DATABASE_URL`: проект сам
использует `prisma/dev.db`.

После изменения `.env` перезапустите dev-сервер или Docker-контейнер. Файл
`.env` содержит секреты и не должен попадать в Git.

Без `TELEGRAM_BOT_TOKEN` обычный сайт и игры продолжают работать, но
`POST /api/auth/telegram` возвращает `503 telegram_disabled`, а пользователи
Telegram остаются гостями.

Без `ADMIN_KEY` административная страница и API статистики намеренно отвечают
404. После настройки админка доступна по адресам:

- <http://localhost:3000/ru/admin>;
- <http://localhost:3000/en/admin>.

## Полезные команды

| Команда | Назначение |
|---|---|
| `npm run dev` | Запустить Next.js в режиме разработки |
| `npm run build` | Создать production-сборку и проверить типы |
| `npm start` | Запустить ранее собранное приложение |
| `npm run lint` | Запустить ESLint |
| `npm test` | Запустить все Vitest-тесты один раз |
| `npm run test:watch` | Запустить Vitest в watch-режиме |
| `npm run test:coverage` | Запустить Vitest с отчётом покрытия |
| `npm run test:e2e` | Запустить Playwright e2e-тесты |
| `npm run test:all` | Последовательно запустить Vitest и Playwright |
| `npx prisma generate` | Перегенерировать Prisma Client |
| `npx prisma db push` | Синхронизировать dev-базу со схемой |
| `npx prisma studio` | Открыть Prisma Studio для локальной базы |

## Тестирование

### Unit- и integration-тесты

```bash
npm test
```

Тесты из `tests/` покрывают:

- чистые движки всех игр и их сериализацию;
- Zustand-сторы;
- схемы Zod;
- сессии, пароли и проверку Telegram `initData`;
- автосохранение и удалённую синхронизацию;
- API с реальной временной SQLite-базой;
- locale redirect и CSRF-защиту proxy.

Watch-режим и coverage:

```bash
npm run test:watch
npm run test:coverage
```

HTML-отчёт покрытия создаётся в `coverage/index.html`.

### E2E-тесты

Один раз установите Chromium для Playwright:

```bash
npx playwright install chromium
```

На Linux при необходимости установить и системные зависимости:

```bash
npx playwright install --with-deps chromium
```

После этого:

```bash
npm run test:e2e
```

Playwright использует порт `3199` и отдельную базу `.e2e/e2e.db`, которая
пересоздаётся перед прогоном. Если production-сборки ещё нет, global setup
создаст её автоматически.

### Проверка перед отправкой изменений

```bash
npm test
npx eslint src tests
npm run build
```

При изменении пользовательского сценария также запустите:

```bash
npm run test:e2e
```

## Telegram Mini Apps

Стартовая страница Mini App:

```text
https://your-domain.example/ru/games
```

Её нужно указать в BotFather для того же бота, чей API token задан в
`TELEGRAM_BOT_TOKEN`.

Интеграция выполняет следующие действия:

- вызывает Telegram Web App SDK `ready()` и `expand()`;
- применяет цвета и параметры viewport Telegram, включая тёмную нижнюю панель навигации Android в поддерживаемых версиях Telegram;
- при открытии в браузере задаёт тёмные `theme-color` и `color-scheme` для системного оформления;
- отключает vertical swipes, конфликтующие с игровыми жестами;
- использует Telegram Haptic Feedback с browser fallback;
- проверяет HMAC-подпись и свежесть `initData` на сервере;
- связывает Telegram-пользователя с постоянным профилем и его сохранениями.

В `web.telegram.org` приложение работает в cross-site iframe, где сторонние
cookie могут быть полностью заблокированы. Поэтому клиент получает сырые
`initData` из SDK или URL hash `#tgWebAppData=...`, а `apiFetch` добавляет к
каждому API-запросу:

```http
Authorization: tma <initData>
```

Сервер проверяет подпись заголовка на каждом запросе и находит профиль по
Telegram ID. Авторизация в веб-версии Telegram не зависит от cookie.

## Сохранения и синхронизация

1. При первом API-запросе создаётся гостевой профиль.
2. Значимые изменения игры попадают в Zustand-стор.
3. `useAutosave` отправляет сохранение на сервер с debounce; тики таймера сами
   по себе сохранение не создают.
4. `useRemoteWatch` проверяет более свежие изменения с другого устройства.
5. При конфликте пользователь выбирает облачную или текущую локальную версию.
6. Регистрация и Telegram-вход обновляют текущий гостевой профиль без потери
   накопленного прогресса.
7. Ссылка «Открыть на другом устройстве» позволяет перенести профиль через
   одноразовый токен и QR-код.

## Архитектура

```text
src/
├── app/
│   ├── [locale]/                 # страницы /ru и /en
│   │   ├── admin/                # административный дашборд
│   │   ├── games/                # хаб игр
│   │   ├── link/[token]/         # перенос профиля на устройство
│   │   └── play/                 # страницы игр
│   └── api/                      # backend Route Handlers
├── components/
│   ├── games/                    # UI и интеграция игровых клиентов
│   ├── landing/                  # блоки лендинга
│   └── ui/                       # shadcn/ui primitives
├── hooks/                        # autosave, session, remote watch
├── i18n/                         # локали и словари
├── lib/
│   ├── games/                    # чистые игровые движки
│   ├── analytics.ts             # внутренняя аналитика
│   ├── api.ts                   # клиент API и Telegram auth header
│   ├── session.ts               # cookie/TMA-сессии
│   └── telegram*.ts             # Telegram client/server helpers
├── stores/                       # Zustand-сторы игр
└── proxy.ts                     # locale redirect и CSRF Origin guard

prisma/schema.prisma             # схема SQLite
scripts/init-db.mjs              # production DDL/миграции
tests/                           # Vitest
tests-e2e/                       # Playwright
.github/workflows/               # сборка и публикация релизов
deploy/                          # systemd, nginx и update.sh
```

Игры разделены на три слоя:

```text
чистый движок → Zustand-стор → React client component
```

Движок не зависит от React и I/O, поэтому правила игры тестируются отдельно от
интерфейса. Подробный чек-лист добавления игры и правила архитектуры находятся
в [AGENTS.md](./AGENTS.md).

## API

| Метод | Маршрут | Назначение |
|---|---|---|
| `GET` | `/api/session` | Текущий игрок и список сохранений |
| `POST` | `/api/auth/register` | Регистрация с сохранением гостевого прогресса |
| `POST` | `/api/auth/login` | Вход по email и паролю |
| `POST` | `/api/auth/logout` | Завершение сессии |
| `POST` | `/api/auth/telegram` | Вход через Telegram `initData` |
| `POST` | `/api/link-device` | Создание одноразовой ссылки устройства |
| `POST` | `/api/link-device/claim` | Активация ссылки на другом устройстве |
| `GET/PUT/DELETE` | `/api/saves/:game` | Получение, обновление и удаление сохранения |
| `POST` | `/api/results` | Запись результата завершённой игры |
| `GET` | `/api/health` | Версия, аптайм и проверка доступности БД |
| `GET` | `/api/admin/stats` | Статистика; требуется `X-Admin-Key` |

Входные данные API валидируются через Zod. Пароли хешируются с помощью scrypt.
Для mutating API-запросов `src/proxy.ts` проверяет `Origin`, что особенно важно
из-за `SameSite=None` cookie внутри Telegram iframe.

## Аналитика и админка

Внутренняя аналитика хранится в той же SQLite-базе. Внешние трекеры и IP-адреса
не используются.

Дашборд `/{locale}/admin` показывает:

- общее число игроков, DAU, WAU и MAU;
- новых пользователей и типы профилей;
- активность за последние дни;
- количество партий и игроков по каждой игре;
- среднее время и число ходов;
- ленту последних результатов.

Ключ передаётся API в заголовке `X-Admin-Key`. В браузере введённый ключ
хранится только в `sessionStorage` текущей вкладки.

## Production-сборка

Локальная проверка production-режима:

```bash
npm run build
npm start
```

`next.config.ts` использует `output: "standalone"`. Релизный workflow собирает
самодостаточный архив с сервером, статикой и production-миграциями.

## Деплой

Production-схема проекта:

```text
GitHub Actions → GitHub Release → update.sh → systemd → nginx
```

Для релиза доступны два workflow:

- **Auto Release** — автоматически повышает patch/minor/major;
- **Release** — публикует указанную вручную версию.

На сервере обновление выполняется командой:

```bash
sudo /opt/puzzlehub/update.sh latest
```

Скрипт скачивает release asset, обновляет SQLite-схему, переключает активный
релиз, перезапускает systemd-сервис, выполняет health-check и автоматически
откатывается при ошибке.

Полная инструкция по первичной настройке Node.js 22, nginx, systemd, HTTPS,
GitHub token для приватного репозитория, обновлению, откату и резервному
копированию находится в [DEPLOY.md](./DEPLOY.md).

## Решение частых проблем

### `next: not found` в Docker

Bind mount проекта скрыл `/app/node_modules`. Используйте `compose.yaml` или
обязательно подключайте отдельный volume:

```text
-v puzzlehub_node_modules:/app/node_modules
```

### `Module not found` после обновления зависимостей в Docker

```bash
docker compose down -v
docker compose up --build
```

### Не найден сгенерированный Prisma Client

```bash
npx prisma generate
npx prisma db push
```

### `SQLITE_CANTOPEN`

Проверьте путь в `DATABASE_URL`, существование родительского каталога и права
на запись. Для стандартного локального запуска удалите пользовательский
`DATABASE_URL` и выполните:

```bash
npx prisma db push
```

### Нужно полностью пересоздать локальную базу

> Команда ниже безвозвратно удаляет локальные профили и сохранения.

```bash
rm -f prisma/dev.db
npx prisma db push
```

### Порт 3000 уже занят

На хосте можно использовать другой порт:

```bash
npm run dev -- -p 3001
```

Для Docker измените публикацию порта в `compose.yaml`, например
`"3001:3000"`.

### Telegram API отвечает `503 telegram_disabled`

Добавьте `TELEGRAM_BOT_TOKEN` в `.env` и перезапустите приложение. Токен должен
принадлежать тому же боту, чей Mini App открывает PuzzleHub.

### Админка отвечает 404

Добавьте `ADMIN_KEY` в `.env` и перезапустите dev-сервер. Без ключа админка
выключена намеренно.

### Ошибка сборки нативного `better-sqlite3`

Используйте Node.js 22.x. Если для вашей платформы нет готового бинарного
пакета, npm потребуется локальный toolchain: Python 3, `make` и C/C++ compiler.

---

Перед существенными изменениями прочитайте [AGENTS.md](./AGENTS.md). В нём
описаны архитектурные ограничения, дизайн-система, правила добавления игр,
особенности Telegram Web и обязательный чек-лист проверки изменений.
