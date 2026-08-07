# Telegram AI News Digest

> Статус: MVP в разработке, поэтапно (см. `docs/architecture.md` и `docs/decisions/`).

## 1. Что делает проект

_TODO (заполняется по мере готовности функциональности): персональный Telegram-бот собирает публикации из добавленных пользователем публичных Telegram-каналов, отфильтровывает рекламу и дубликаты, классифицирует материалы через Claude API и присылает важные новости мгновенно, а остальное — в ежедневном дайджесте в 09:00 (Asia/Bishkek)._

## 2. Ограничения публичных Telegram-каналов

_TODO: только публичные каналы, добавляемые вручную по ссылке; никакой авторизации личного аккаунта, MTProto, номера телефона, кода или 2FA-пароля; RSS получается через самостоятельно размещённый RSSHub (`t.me/s/<channel>`)._

## 3. Требования

_TODO: Docker + Docker Compose, аккаунт Telegram для BotFather, ключ Claude API._

## 4. Создание Telegram-бота через BotFather

_TODO_

## 5. Получение Telegram user ID

_TODO_

## 6. Получение Claude API key

_TODO_

## 7. Настройка `.env`

_TODO: скопировать `.env.example` в `.env`, заполнить реальные значения. Секреты никогда не коммитить._

## 8. Запуск Docker Compose

```bash
docker compose up -d
docker compose ps
```

## 9. Импорт n8n workflows

_TODO: заполняется по мере готовности спецификаций/JSON в `n8n/workflows/` и `docs/workflows/`._

## 10. Добавление первого канала

_TODO: команда `/add_source <ссылка>` (появится на этапе E)._

## 11. Тестирование

_TODO: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`._

## 12. Резервное копирование

_TODO: см. `docs/backup.md`._

## 13. Устранение неисправностей

_TODO: см. `docs/troubleshooting.md`._

## 14. Частые ошибки RSS

_TODO: см. `docs/troubleshooting.md`._

## 15. Обновление проекта

_TODO_
