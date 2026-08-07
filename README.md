# Telegram AI News Digest

> Статус: MVP, построен поэтапно (Stage A–L). Обзор архитектуры и обоснование решений — `docs/architecture.md` и `docs/decisions/`. Спецификации всех n8n-workflow — `docs/workflows/`.

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

Заполните как минимум: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_ID`, `CLAUDE_API_KEY`, `POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY` (любая случайная строка — используется n8n для шифрования хранилища credentials, **не меняйте её после первого запуска**, иначе существующие credentials в n8n станут нечитаемыми).

`.env` уже в `.gitignore` — секреты никогда не коммитятся. `.env.example` — единственный файл с полным списком переменных, но без реальных значений.

## 8. Запуск Docker Compose

```bash
docker compose up -d
docker compose ps
```

Поднимает четыре сервиса: `postgres`, `rsshub`, `n8n`, `helper-api`. `helper-api` не публикуется наружу (доступен только из внутренней Docker-сети — n8n обращается к нему по имени сервиса, `http://helper-api:3000`). `postgres` публикуется только на `127.0.0.1` (для миграций/`psql` с хоста, не в локальную сеть). n8n доступен на `http://localhost:${N8N_PORT}` (по умолчанию `5679` — намеренно не `5678`, чтобы не конфликтовать с уже запущенным n8n на этом порту, если он у вас есть).

Остановка: `docker compose down` (данные в volumes `pgdata`/`n8n_data` сохраняются). Полная очистка (удаляет и данные): `docker compose down -v`.

## 9. Импорт n8n workflows

Планировалось так: для workflow, которые оказались структурно сложными (вложенные циклы, много ветвлений — `poll_rss_sources`, `classify_with_claude`, `daily_digest`, `telegram_commands` и т.д.), готового JSON нет — есть только подробная спецификация в `docs/workflows/`, по которой нужно собрать workflow вручную в интерфейсе n8n. Для одной workflow, которая оказалась близка к линейной (`health_check`), есть черновой JSON в `n8n/workflows/health_check.json` — он **не проверен** на реальном n8n (в среде, где собирался проект, n8n для проверки не было) и требует ручной проверки/правки после импорта.

Порядок:

1. Настройте credentials — `n8n/credential-setup.md` (Telegram, Claude/Anthropic, Postgres).
2. Соберите workflow по спецификациям из `docs/workflows/` в порядке: `add_source`, `remove_source`, `pause_source`, `resume_source`, `poll_rss_sources`, `deduplicate_posts`, `classify_with_claude`, `send_instant_alerts`, `daily_digest`, `telegram_commands`, `manage_interests`, `health_check`, `error_handler`.
3. Для каждой workflow, кроме `telegram_commands`/`health_check`/`error_handler`, укажите **Settings → Error Workflow** = `error_handler`.
4. Активируйте workflow (переключатель Active).

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
