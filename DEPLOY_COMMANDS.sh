#!/bin/bash
# Команды для деплоя всех 9 PR'ов

set -e

echo "🚀 Начинаем деплой PR1-PR9..."

# 1. Добавляем все изменения
echo "📦 Добавляем изменения в git..."
git add -A

# 2. Проверяем статус
echo "📊 Статус изменений:"
git status --short

# 3. Коммитим
echo "💾 Создаем коммит..."
git commit -m "feat: реализованы PR1-PR9 по плану архитектора

- PR1: Internal Notes (conversation_notes, NotesService, WS events)
- PR2: Pinned Messages (is_pinned, pinned_order, pin/unpin endpoints)
- PR3: Media thumbnails (message_media table, курсорная пагинация)
- PR4: Stickers (message_stickers, sendSticker support)
- PR5: Online Status (PresenceService, Redis, WS presence events)
- PR6: Last Message Preview (last_message_preview auto-update)
- PR7: Mute (conversation_user_settings, mute/unmute)
- PR8: Profile View (sender_photo_url, sender_bio, sender_verified)
- PR9: WS events, права, метрики (presence:heartbeat, permissions)

Все миграции добавлены в init-db.controller.ts"

# 4. Пуш в основную ветку (Render деплоит автоматически)
echo "🚀 Отправляем в git..."
git push origin main

echo ""
echo "✅ Изменения отправлены в git"
echo ""
echo "⏳ Render автоматически начнет деплой..."
echo ""
echo "⚠️  ПОСЛЕ деплоя обязательно запустите миграцию БД:"
echo ""
echo "   curl -X GET https://fastprep-admin-api.onrender.com/api/init-db/migrate"
echo ""
echo "   или"
echo ""
echo "   curl -X POST https://fastprep-admin-api.onrender.com/api/init-db/migrate"
echo ""

