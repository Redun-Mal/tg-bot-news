# Telegram AI News Digest

> Статус: MVP. Все 12 n8n-workflow собраны и проверены вживую (headless через REST API n8n) против реальных Postgres/RSSHub/Telegram; `telegram_commands` подтверждён реальными сообщениями от реального пользователя через реальный webhook. Единственное, чего не хватает — `CLAUDE_API_KEY` (классификация ошибается с настоящим 401 от Anthropic — корректно, без списания средств). Подробности — `docs/smoke-checklist.md`. Обзор архитектуры и обоснование решений — `docs/architecture.md` и `docs/decisions/` (включая 7 реальных багов n8n, найденных в процессе — `docs/decisions/005-n8n-postgres-node-quirks.md`). Спецификации всех n8n-workflow — `docs/workflows/`.

## 1. Что делает проект

Персональный Telegram-бот собирает публикации из публичных Telegram-каналов, которые пользователь добавляет вручную по ссылке, отфильтровывает рекламу/розыгрыши/промокоды и дубликаты, передаёт оставшееся в Claude API для категоризации и оценки важности, а затем:

1. Присылает важные новости сразу (`importance >= 3` и `relevance >= 0.75`).
2. Раз в день в 09:00 (Asia/Bishkek) присылает дайджест остального, сгруппированный по категориям.
3. Отвечает на команды и обычные текстовые запросы вида «Покажи новости про Roblox» или «Сделай дайджест по AI».

Технически — n8n (оркестрация workflow) + PostgreSQL (хранение) + Claude API (классификация/саммари) + самостоятельно размещённый RSSHub (единственный источник публикаций — Telegram-каналы не имеют собственного RSS). Небольшой вспомогательный TypeScript-сервис (`services/helper-api`) держит логику, которую стоит реально тестировать (нормализация текста, дедупликация, форматирование дайджеста), вне inline JS в n8n.

## 2. Ограничения публичных Telegram-каналов

Это осознанные ограничения дизайна, а не временные упрощения:

- Никакой авторизации личного Telegram-аккаунта, MTProto, запроса номера телефона/кода/2FA-пароля.
- Работа только с **публичными** каналами, добавленными пользователем вручную по ссылке (`https://t.me/<channel>`).
- RSS получается через самостоятельно размещённый [RSSHub](https://docs.rsshub.app/) (`docker-compose.yml`, сервис `rsshub`), который скрейпит публичную веб-версию канала (`t.me/s/<channel>`) — без входа в аккаунт.
- Бот отвечает **только** `TELEGRAM_ALLOWED_USER_ID` — сообщения от остальных отправителей молча игнорируются (без ответа, без подтверждения существования бота), см. `docs/workflows/telegram_commands.md`.
- Никакой массовой рассылки или публикации в чужие каналы.

## 3. Требования

- Docker и Docker Compose.
- Node.js 20+ и npm (для миграций, seed-скрипта, линта/тестов `helper-api` — не обязателен для самого запуска бота, только для разработки).
- Аккаунт Telegram (для создания бота через BotFather и получения своего user ID).
- Ключ Claude API (Anthropic Console).

## 4. Создание Telegram-бота через BotFather

1. Откройте чат с [@BotFather](https://t.me/BotFather) в Telegram.
2. Отправьте `/newbot`, задайте имя и username бота (username должен заканчиваться на `bot`).
3. BotFather пришлёт токен вида `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` — это `TELEGRAM_BOT_TOKEN`.
4. Токен нужен в двух местах: в `.env` (для документации/справки) и как credential внутри n8n (см. `n8n/credential-setup.md`) — именно credential n8n реально использует, а не переменная окружения контейнера.

## 5. Получение Telegram user ID

Проще всего — написать [@userinfobot](https://t.me/userinfobot) в Telegram, он ответит числовым ID. Это значение — `TELEGRAM_ALLOWED_USER_ID`. Бот будет отвечать только на сообщения с этим ID.

## 6. Получение Claude API key

1. Зарегистрируйтесь на [console.anthropic.com](https://console.anthropic.com).
2. Создайте API-ключ (Settings → API Keys).
3. Это значение — `CLAUDE_API_KEY`. Как и токен Telegram-бота, реально используется через n8n credential (`n8n/credential-setup.md`), а не напрямую из `.env` внутри workflow.
4. По умолчанию используется дешёвая/быстрая модель (`CLAUDE_MODEL=claude-haiku-4-5`) — рост стоимости оправдан, только если качество классификации на практике окажется недостаточным.

## 7. Настройка `.env`

```bash
cp .env.example .env
```

Заполните как минимум: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `CLAUDE_API_KEY`, `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY` (любая случайная строка — используется n8n для шифрования хранилища credentials, **не меняйте её после первого запуска**, иначе существующие credentials в n8n станут нечитаемыми). `WEBHOOK_URL` нужен только для `telegram_commands` (реальный webhook Telegram) — оставьте пустым, если пока не собираетесь принимать реальные сообщения; для разработки подойдёт `ngrok http ${N8N_PORT}`.

`.env` уже в `.gitignore` — секреты никогда не коммитятся. `.env.example` — единственный файл с полным списком переменных, но без реальных значений.

## 8. Запуск Docker Compose

```bash
docker compose up -d
docker compose ps
```

Поднимает четыре сервиса: `postgres`, `rsshub`, `n8n`, `helper-api`. `helper-api` не публикуется наружу (доступен только из внутренней Docker-сети — n8n обращается к нему по имени сервиса, `http://helper-api:3000`). `postgres` публикуется только на `127.0.0.1` (для миграций/`psql` с хоста, не в локальную сеть). n8n доступен на `http://localhost:${N8N_PORT}` (по умолчанию `5679` — намеренно не `5678`, чтобы не конфликтовать с уже запущенным n8n на этом порту, если он у вас есть).

Остановка: `docker compose down` (данные в volumes `pgdata`/`n8n_data` сохраняются). Полная очистка (удаляет и данные): `docker compose down -v`.

## 9. Импорт n8n workflows

Все 12 workflow в `n8n/workflows/` — это **реальные экспорты**, собранные и проверенные вживую (через REST API n8n, headless), а не черновики вслепую. Подробности что именно проверено — `docs/smoke-checklist.md` и секция «n8n JSON» в каждом файле `docs/workflows/*.md`.

Порядок:

1. Настройте credentials — `n8n/credential-setup.md` (Telegram, Claude/Anthropic, Postgres). ID credentials в экспортированных JSON — плейсхолдеры (`REPLACE_ME`); после импорта переназначьте credential на каждой ноде через UI.
2. Импортируйте JSON-файлы из `n8n/workflows/` в порядке: `error_handler` (сначала — на него ссылаются остальные), `add_source`, `remove_source`, `pause_source`, `resume_source`, `poll_rss_sources`, `deduplicate_posts`, `classify_with_claude`, `send_instant_alerts`, `daily_digest`, `manage_interests`, `health_check`, `telegram_commands`.
3. У `telegram_commands.json` поле `webhookId` на ноде Telegram Trigger — тоже плейсхолдер; **импортируйте через UI n8n** (не через сырой POST к REST API) — тогда n8n сам присвоит корректный `webhookId` при активации. См. `docs/decisions/005-n8n-postgres-node-quirks.md`, Quirk 7 — при неправильной активации Telegram будет получать 404 на реальные сообщения.
4. Каждой workflow, кроме `error_handler`, уже проставлен **Settings → Error Workflow** = `error_handler` в экспорте — проверьте, что ссылка не сломалась после импорта (n8n может присвоить новый internal ID).
5. Активируйте workflow (переключатель Active). Для `telegram_commands` понадобится публичный HTTPS URL (`WEBHOOK_URL` в `.env`, например через `ngrok http ${N8N_PORT}` для разработки — см. `docs/troubleshooting.md`).
6. `telegram_commands` сейчас реализует только `/start`, `/help`, `/sources`, `/add_source` — остальные команды из спецификации ещё не собраны (см. `docs/smoke-checklist.md`).

## 10. Добавление первого канала

После того как `telegram_commands` и `add_source` собраны и активны, напишите боту (с аккаунта, чей ID указан в `TELEGRAM_ALLOWED_USER_ID`):

```
/add_source https://t.me/example_channel
```

Бот проверит ссылку, соберёт RSS-URL через RSSHub, проверит доступность и сохранит канал. Через 10 минут (или сразу — можно выполнить `poll_rss_sources` вручную кнопкой в n8n) появятся первые публикации.

## 11. Тестирование

```bash
npm install
npm run lint          # eslint по всему репозиторию
npm run format:check  # prettier --check
npm run typecheck     # tsc --noEmit для services/helper-api
npm test              # vitest — services/helper-api (нормализация, дедуп-хелперы, валидация классификации, форматирование дайджеста, auth-gate, валидация интересов)
```

`services/helper-api` тестируется независимо от n8n (нет живого n8n, необходимого для полноценного end-to-end прогона workflow — см. `docs/decisions/`). Ручная проверка ingestion-пути (RSSHub → `/normalize` → Postgres с `ON CONFLICT DO NOTHING`) и state-machine источников (`active`/`paused`/`error`/`removed`) выполнена вручную против живого docker-compose стека при разработке — см. коммиты Stage E/F/H.

Полный чек-лист (что уже проверено вручную, а что требует ваших собственных ключей/бота) — `docs/smoke-checklist.md`.

## 12. Резервное копирование

См. `docs/backup.md` — команды `pg_dump`/восстановления и резервное копирование volume `n8n_data`.

## 13. Устранение неисправностей

См. `docs/troubleshooting.md` — типичные проблемы запуска, ротация ключей.

## 14. Частые ошибки RSS

См. `docs/troubleshooting.md#frequent-rss-errors` (раздел «Frequent RSS errors» — документация в `docs/` на английском для единообразия с остальными техническими доками, кроме этого README).

## 15. Обновление проекта

```bash
git pull
npm install
npm run db:migrate     # применить новые миграции, если есть
docker compose build helper-api   # если менялся код helper-api
docker compose up -d
```

Обновления n8n-версии делайте осознанно — файл `docker-compose.yml` фиксирует конкретный тег образа (`n8nio/n8n:1.60.1`), а не `latest`, именно для предсказуемости версий нод при импорте workflow (см. `docs/decisions/`). После обновления тега проверьте импортированные workflow на регресс перед тем как полагаться на них.
