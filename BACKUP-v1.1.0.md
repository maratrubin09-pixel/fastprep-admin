# Backup v1.1.0

**Дата создания:** 1 ноября 2025  
**Версия:** 1.1.0

## Что было исправлено в этой версии

### Критические исправления

1. **Валидация `telegramPeerId` и `accessHash`**
   - Проверка валидности `accessHash` перед использованием сохранённого `telegramPeerId`
   - Предотвращение ошибки `PEER_ID_INVALID` при использовании невалидных данных
   - Fallback на `getDialogs()` если `telegramPeerId` невалидный

2. **Улучшенная обработка новых чатов Telegram**
   - Сохранение `telegramPeerId` из `message.peerId` (если `accessHash` валидный)
   - Получение полного entity через `getDialogs()` для новых чатов
   - Создание `telegramPeerId` из entity, найденного в списке диалогов

3. **Подробное логирование**
   - Логирование `userId` и `accessHash` при восстановлении `InputPeer`
   - Детальная диагностика процесса определения чатов

4. **S3 интеграция для воркера**
   - Добавлены переменные окружения S3 в worker сервис
   - Исправлена отправка файлов в Telegram через воркер
   - Установлен `S3_REGION = nyc3` для явного указания региона

## Как создать бэкап

### Вариант 1: Через npm скрипт (рекомендуется)

```bash
DATABASE_URL="your_database_url_here" npm run backup
```

### Вариант 2: Напрямую через скрипт

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh "your_database_url_here"
```

Или если `DATABASE_URL` уже установлен в окружении:
```bash
./scripts/backup.sh
```

### Вариант 3: Получить DATABASE_URL из Render

1. Render Dashboard → **fastprep-postgres** → **Info**
2. Скопировать **Internal Database URL** или **Connection Pooling URL**
3. Выполнить:
```bash
DATABASE_URL="скопированный_URL" npm run backup
```

## Где сохраняются бэкапы

Бэкапы сохраняются в папку `backups/` с именем:
```
backup-v1.1.0-YYYYMMDD_HHMMSS.sql
```

**Важно:** 
- Папка `backups/` должна быть в `.gitignore` (не коммитить бэкапы в репозиторий!)
- Сохраняйте бэкапы в безопасном месте (облачное хранилище, локальный диск)

## Восстановление из бэкапа

```bash
psql "your_database_url_here" < backups/backup-v1.1.0-YYYYMMDD_HHMMSS.sql
```

Или:
```bash
psql "$DATABASE_URL" < backups/backup-v1.1.0-YYYYMMDD_HHMMSS.sql
```

## Требования

- `pg_dump` должен быть установлен в системе
- На macOS: `brew install postgresql`
- Доступ к базе данных через `DATABASE_URL

## Автоматические бэкапы

Render также предоставляет автоматические бэкапы через:
- **Point-in-Time Recovery** (последние 3 дня для Basic плана)
- **Export** (логические бэкапы, сохраняются 7 дней)

Рекомендуется комбинировать автоматические бэкапы Render и ручные бэкапы через скрипт для максимальной защиты данных.

