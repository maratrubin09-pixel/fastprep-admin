# Как выполнить SQL запрос в Render

## Способ 1: Render Shell (Самый простой) ✅ РЕКОМЕНДУЕТСЯ

**Шаги:**
1. Откройте Render Dashboard → `fastprep-admin-api`
2. В левой панели найдите раздел **"MANAGE"**
3. Кликните на **"Shell"**
4. Откроется веб-терминал
5. Выполните команду:
   ```bash
   psql $DATABASE_URL
   ```
6. После подключения выполните SQL:
   ```sql
   SELECT 
     id,
     chat_title,
     chat_type,
     external_chat_id,
     sender_first_name,
     sender_last_name,
     sender_username,
     sender_phone,
     telegram_peer_id,
     created_at,
     updated_at
   FROM conversations
   WHERE chat_title = 'Unknown'
   ORDER BY created_at DESC
   LIMIT 5;
   ```

**Преимущества:**
- Не нужно устанавливать ничего локально
- Работает прямо в браузере
- Автоматически использует правильный DATABASE_URL

---

## Способ 2: Локально через psql (если установлен PostgreSQL)

**Шаги:**
1. Получите `DATABASE_URL` из Render:
   - Render Dashboard → `fastprep-admin-api` → **Environment**
   - Найдите переменную `DATABASE_URL`
   - Скопируйте значение

2. В терминале выполните:
   ```bash
   psql "DATABASE_URL_ЗДЕСЬ"
   ```

3. Выполните SQL запрос (как выше)

**Альтернатива - одной командой:**
```bash
psql "DATABASE_URL_ЗДЕСЬ" -c "SELECT id, chat_title, sender_first_name, sender_last_name, sender_username FROM conversations WHERE chat_title = 'Unknown' ORDER BY created_at DESC LIMIT 5;"
```

---

## Способ 3: Через Render Jobs (если настроены)

Если у вас есть Job в Render для выполнения SQL:
1. Render Dashboard → Jobs
2. Найдите нужный Job
3. Запустите его с SQL запросом

**Не рекомендуется** для разовых запросов.

---

## Способ 4: Через API endpoint (если есть)

Если у вас есть административный endpoint для выполнения SQL:
```bash
curl -X POST https://fastprep-admin-api.onrender.com/admin/sql \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"query": "SELECT ... FROM conversations WHERE chat_title = '\''Unknown'\'' ..."}'
```

**Не рекомендуется** - небезопасно для production.

---

## РЕКОМЕНДАЦИЯ: Используйте Render Shell (Способ 1)

**Как это выглядит:**
1. Render Dashboard → `fastprep-admin-api`
2. Слева: **MANAGE** → **Shell**
3. В терминале:
   ```bash
   psql $DATABASE_URL
   ```
4. После подключения введите SQL запрос

**Пример вывода:**
```
postgres=> SELECT id, chat_title, sender_first_name FROM conversations WHERE chat_title = 'Unknown' LIMIT 1;
                  id                  | chat_title | sender_first_name 
--------------------------------------+------------+------------------
 123e4567-e89b-12d3-a456-426614174000 | Unknown    | 
(1 row)
```

---

## Упрощенный SQL запрос (для быстрой проверки):

```sql
SELECT 
  id,
  chat_title,
  sender_first_name,
  sender_last_name,
  sender_username,
  sender_phone,
  created_at
FROM conversations
WHERE chat_title = 'Unknown'
ORDER BY created_at DESC
LIMIT 1;
```

Это покажет последний Unknown чат с минимальными данными.

---

## Что делать, если Shell недоступен:

1. **Проверьте доступ:** Убедитесь, что у вас есть права на Shell
2. **Используйте DATABASE_URL:** Получите его из Environment и используйте Способ 2
3. **Обратитесь в поддержку Render:** Если Shell не работает

---

## Альтернатива: Просто скопируйте логи из Render

Если SQL выполнить сложно, можно просто скопировать логи из Render API, где видны SQL запросы:
- В логах будут видны SQL INSERT/UPDATE запросы
- Например: `UPDATE conversations SET chat_title = $1 WHERE id = $2`

Но это менее информативно, чем прямой SQL запрос.

