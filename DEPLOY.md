# Деплой PuzzleHub

Схема: **GitHub Actions (по клику) → GitHub Releases → сервер (Node.js + systemd + nginx)**.
Без Docker. На сервере нужен только Node.js 22 и nginx.

```
GitHub Actions ──build+test──▶ Release v1.0.0 (puzzlehub-1.0.0.tar.gz)
                                        │
             сервер: update.sh v1.0.0 ──┘
                     │
   /opt/puzzlehub/releases/v1.0.0  ◀── распаковка
   /opt/puzzlehub/current ─────────── symlink на активный релиз
   systemd (puzzlehub.service) ────── node server.js на 127.0.0.1:3000
   nginx ──────────────────────────── https://ваш-домен → 127.0.0.1:3000
   /var/lib/puzzlehub/prod.db ─────── SQLite (живёт отдельно от релизов)
```

---

## 1. Сборка релиза в GitHub Actions (по клику)

В репозитории три workflow (`.github/workflows/`):

| Workflow | Когда использовать |
|---|---|
| **Auto Release** (`auto-release.yml`) | Обычный случай: версия вычисляется сама по последнему тегу. Выбираете только тип бампа: patch / minor / major |
| **Release** (`release.yml`) | Когда нужна конкретная версия (например, первая `1.0.0` или `2.0.0-rc.1`) |
| `build-release.yml` | Переиспользуемый «конвейер» (lint → тесты → сборка → публикация); напрямую не запускается |

### Вариант A — Auto Release (рекомендуется)

1. Вкладка **Actions → Auto Release → Run workflow**.
2. Выберите тип бампа (по умолчанию `patch`) и нажмите **Run**.

Следующая версия считается от последнего стабильного тега `v*`:
`v1.2.3` + patch → `1.2.4`, + minor → `1.3.0`, + major → `2.0.0`.
Если тегов ещё нет — первый релиз будет `0.1.0`. Pre-release-теги
(`v1.3.0-rc.1`) на расчёт не влияют, пока есть хоть один стабильный.

### Вариант B — Release (ручная версия)

1. Вкладка **Actions → Release → Run workflow**.
2. Введите версию, например `1.0.0` (формат проверяется), нажмите **Run**.

Оба варианта дальше делают одно и то же: прогоняют ESLint и все vitest-тесты
(падают тесты — релиза не будет), собирают standalone-бандл и публикуют в
**Releases** архив `puzzlehub-<версия>.tar.gz` с тегом `v<версия>`. Внутри —
всё для запуска: `server.js`, минимальный `node_modules`, статика,
`scripts/init-db.mjs` (инициализация/миграция БД) и файл `VERSION`.

> ⚠️ Node.js на сервере должен быть той же мажорной версии, что в workflow
> (**22.x**): `better-sqlite3` — нативный модуль, компилируется при сборке.

---

## 2. Первичная настройка сервера (один раз)

Все команды — на сервере под пользователем с sudo. Пример для Debian/Ubuntu.

### 2.1. Node.js 22 и nginx

```bash
# Node.js 22 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
node -v   # v22.x
```

### 2.2. Пользователь и каталоги

```bash
sudo useradd --system --home /opt/puzzlehub --shell /usr/sbin/nologin puzzlehub
sudo mkdir -p /opt/puzzlehub/releases /var/lib/puzzlehub /etc/puzzlehub
sudo chown -R puzzlehub:puzzlehub /opt/puzzlehub /var/lib/puzzlehub
```

### 2.3. Переменные окружения

```bash
sudo tee /etc/puzzlehub/env >/dev/null <<'EOF'
DATABASE_URL=file:/var/lib/puzzlehub/prod.db
SESSION_SECRET=ЗАМЕНИТЕ_НА_ДЛИННУЮ_СЛУЧАЙНУЮ_СТРОКУ
ADMIN_KEY=ЗАМЕНИТЕ_НА_КЛЮЧ_ДЛЯ_ДАШБОРДА
# TELEGRAM_BOT_TOKEN=123456:ABC-...   # если нужен вход через Telegram Mini Apps
EOF
sudo chmod 600 /etc/puzzlehub/env
```

Секреты можно сгенерировать так: `openssl rand -base64 48` (SESSION_SECRET)
и `openssl rand -hex 24` (ADMIN_KEY).

### 2.4. Токен GitHub (репозиторий приватный)

Релизы приватного репозитория нельзя скачать анонимно — серверу нужен токен.

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**;
2. Repository access: **Only select repositories → `2hardume/puzzlehub`**;
3. Permissions: **Contents → Read-only** (больше ничего не нужно);
4. Срок действия — на ваш вкус (при истечении `update.sh` скажет
   `GitHub auth failed` — просто выпустите новый).

Положите токен на сервер:

```bash
sudo tee /etc/puzzlehub/deploy.env >/dev/null <<'EOF'
GITHUB_TOKEN=github_pat_ВАШ_ТОКЕН
EOF
sudo chmod 600 /etc/puzzlehub/deploy.env
```

Проверьте доступ **до** деплоя:

```bash
sudo /opt/puzzlehub/update.sh check
# OK: latest release v1.2.0, asset: puzzlehub-1.2.0.tar.gz   ← так должно быть
# FAIL: HTTP 404 ...                                          ← токен не подхватился/нет прав
```

> Внутренности: для приватных репозиториев GitHub архив нельзя скачать по
> обычной ссылке релиза — скрипт ходит через API (`.../releases/assets/{id}`,
> заголовок `Accept: application/octet-stream`), получает redirect на
> подписанный S3-URL и скачивает уже без токена (S3 отвергает запросы с двумя
> механизмами авторизации). Всё это `update.sh` делает сам.

### 2.5. Скрипт обновления и systemd

Скопируйте из репозитория `deploy/update.sh` (репозиторий `2hardume/puzzlehub`
уже вписан в него):

```bash
sudo cp deploy/update.sh /opt/puzzlehub/update.sh
sudo chmod +x /opt/puzzlehub/update.sh
```

Установите unit systemd:

```bash
sudo cp deploy/puzzlehub.service /etc/systemd/system/puzzlehub.service
sudo systemctl daemon-reload
sudo systemctl enable puzzlehub
```

### 2.6. Первый деплой

```bash
sudo /opt/puzzlehub/update.sh latest
sudo systemctl status puzzlehub    # active (running)
curl -I http://127.0.0.1:3000/en   # HTTP/1.1 200 OK
```

### 2.7. nginx

```bash
sudo cp deploy/nginx-puzzlehub.conf /etc/nginx/sites-available/puzzlehub
sudo nano /etc/nginx/sites-available/puzzlehub   # замените example.com на свой домен
sudo ln -s /etc/nginx/sites-available/puzzlehub /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

HTTPS (рекомендуется, certbot настроит конфиг сам):

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ваш-домен.ру
```

Готово: сайт на `https://ваш-домен.ру`, все `/api/*` работают, БД лежит в
`/var/lib/puzzlehub/prod.db` и не затрагивается обновлениями.

---

## 3. Обновление релизов

Выпустили новый релиз в Actions → на сервере **одна команда**:

```bash
sudo /opt/puzzlehub/update.sh v1.1.0    # конкретная версия
# или
sudo /opt/puzzlehub/update.sh latest    # последний релиз
```

Скрипт делает всё сам:

1. скачивает архив из GitHub Releases;
2. распаковывает в `/opt/puzzlehub/releases/v1.1.0`;
3. прогоняет миграцию БД (`scripts/init-db.mjs` — идемпотентный DDL,
   существующие данные не трогает);
4. переключает симлинк `current` и перезапускает сервис
   (даунтайм ≈ 1–2 секунды);
5. проверяет здоровье (`GET /en`); **если проверка падает — автоматически
   откатывается** на предыдущий релиз;
6. удаляет старые релизы (хранятся последние 3).

### Откат вручную

```bash
sudo /opt/puzzlehub/update.sh rollback
```

### Полезные команды

```bash
systemctl status puzzlehub            # состояние сервиса
journalctl -u puzzlehub -f            # живые логи приложения
cat /opt/puzzlehub/current/VERSION    # какая версия сейчас активна
ls /opt/puzzlehub/releases            # какие релизы лежат на диске
```

### Бэкап базы

БД — один файл SQLite. Для горячего бэкапа (без остановки сервиса):

```bash
sudo apt-get install -y sqlite3
sudo -u puzzlehub sqlite3 /var/lib/puzzlehub/prod.db \
  ".backup /var/lib/puzzlehub/backup-$(date +%F).db"
```

Строку выше удобно повесить в cron.

---

## 4. Наблюдаемость: метрики, статистика, мониторинг

### Админ-дашборд

**Как зайти из браузера:**

1. Откройте `https://ваш-домен/ru/admin` (или `/en/admin`);
2. Появится форма с одним полем — введите ваш `ADMIN_KEY`
   (значение из `/etc/puzzlehub/env` на сервере);
3. Нажмите «Открыть» — ключ сохранится в sessionStorage на время
   вкладки; после закрытия браузера его попросят снова.

Если вместо формы видите 404 — на сервере не задан `ADMIN_KEY`
(добавьте в `/etc/puzzlehub/env` и `sudo systemctl restart puzzlehub`).
Если пишет «Неверный ключ» — проверьте значение (без кавычек и пробелов).

Дашборд показывает:

- **игроки**: всего / DAU / WAU / MAU / новые за сутки / гости vs аккаунты vs Telegram;
- **график активности за 14 дней**: визиты, завершённые игры, регистрации;
- **по каждой игре**: сколько партий завершено, сколько игроков, среднее время и ходы;
- **события за 30 дней**: `visit`, `register`, `login`, `telegram_login`,
  `device_linked`, `game_finished`;
- **живая лента** последних завершённых партий.

Данные обновляются сами каждые 60 секунд. Без `ADMIN_KEY` страница и API
отвечают 404 — дашборд полностью выключен.

Те же цифры можно забирать скриптом (для алертов, экспорта в таблицы):

```bash
curl -s -H "X-Admin-Key: $ADMIN_KEY" https://ваш-домен/api/admin/stats | jq .players
```

### Как это устроено (и что с приватностью)

Аналитика своя, в той же SQLite: таблица `Event` + `Player.lastSeenAt`.
Никаких IP, cookies третьих сторон и внешних сервисов. «Визит» засчитывается
не чаще раза в 30 минут на игрока (обновление `lastSeenAt` через `/api/session`,
который дергается при каждом открытии сайта). DAU/WAU/MAU считаются по
`lastSeenAt`, так что цифры честные даже для гостей.

### Мониторинг аптайма

`GET /api/health` — без авторизации, отвечает
`{"status":"ok","version":"1.2.3","uptimeSeconds":...}` и **503**, если БД
недоступна. Подключите любой пинговалку (UptimeRobot, BetterStack, cron+curl):

```bash
# пример: алерт в cron каждые 5 минут
*/5 * * * * curl -fsS https://ваш-домен/api/health >/dev/null || echo "PuzzleHub down!" | mail -s ALERT you@example.com
```

`version` в ответе — из файла `VERSION` релиза: сразу видно, что задеплоено.

### Логи

```bash
journalctl -u puzzlehub -f              # живой хвост
journalctl -u puzzlehub --since today   # за сегодня
journalctl -u puzzlehub -p err          # только ошибки
```

nginx-логи трафика: `/var/log/nginx/access.log` (объём запросов, коды ответов,
боты). Для быстрой сводки по кодам:

```bash
awk '{print $9}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head
```

### Чистка старых событий (опционально)

Таблица `Event` растёт. При желании раз в месяц можно удалять события старше
90 дней (статистика панели считается максимум за 30):

```bash
sudo -u puzzlehub sqlite3 /var/lib/puzzlehub/prod.db \
  "DELETE FROM Event WHERE createdAt < datetime('now','-90 days'); VACUUM;"
```

---

## 5. Частые проблемы

| Симптом | Причина / решение |
|---|---|
| `better_sqlite3.node: invalid ELF header` или `was compiled against a different Node.js version` | Версия Node на сервере отличается от CI. Поставьте Node 22.x |
| 502 от nginx | Сервис не запущен: `systemctl status puzzlehub`, логи в `journalctl -u puzzlehub` |
| `SQLITE_CANTOPEN` | Проверьте права: `chown -R puzzlehub:puzzlehub /var/lib/puzzlehub` |
| `/ru/admin` отвечает 404 | Не задан `ADMIN_KEY` в `/etc/puzzlehub/env` — дашборд выключен намеренно |
| `update.sh: GitHub auth failed` / `release not found` | Репозиторий приватный: выполните `sudo /opt/puzzlehub/update.sh check` — он скажет, в чём дело (нет токена, нет прав Contents: Read, истёк срок, или релизов ещё нет) |
| `downloaded file is not a valid tar.gz` | Вместо архива скачалась JSON-ошибка GitHub — почти всегда проблема токена; смотрите `update.sh check` |
| Telegram-вход отвечает `503 telegram_disabled` | Не задан `TELEGRAM_BOT_TOKEN`. Добавьте его в `/etc/puzzlehub/env` (токен из @BotFather того же бота, чей Mini App указывает на сайт) и выполните `sudo systemctl restart puzzlehub`. Без токена всё работает, но пользователи остаются гостями |
| Telegram-вход отвечает `401 invalid_init_data` | Токен задан, но от **другого** бота; либо `initData` старше 24 ч — переоткройте мини-апп |
| Авторизация работает в приложении Telegram, но не в **web.telegram.org** | Обновитесь до свежего релиза: внутри Telegram авторизация идёт заголовком `Authorization: tma <initData>` на каждый запрос и не зависит от cookie (веб-версия может блокировать их полностью в iframe) |
| `/api/*` отвечает `403 cross_origin_rejected` на своём же сайте | nginx не передаёт заголовки хоста — проверьте в конфиге `proxy_set_header Host $host;` (есть в `deploy/nginx-puzzlehub.conf`) |
| После обновления страница старая | Ctrl+F5; ассеты Next хешированные, кэш обновится сам |
