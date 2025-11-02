# Исправления применены

## ✅ Исправление 1: Backend теперь возвращает `object_key` в response

**Файл:** `src/inbox/messages.controller.ts`

**Проблема:** Backend создавал сообщение с `object_key` в БД, но не возвращал это поле в response для frontend.

**Исправление:**
```typescript
// Явно добавляем object_key и objectKey для совместимости с frontend
return {
  ...message,
  object_key: message.object_key,
  objectKey: message.object_key, // camelCase для совместимости
};
```

**Результат:** Frontend теперь получит `object_key` в ответе и сможет отобразить файл в отправленном сообщении.

---

## ✅ Исправление 2: Добавлено логирование для отладки UI

**Файл:** `frontend/src/components/FileUpload.js`

**Проблема:** Непонятно, почему прикрепленный файл не отображается в UI.

**Исправление:**
Добавлено логирование состояния компонента:
```javascript
React.useEffect(() => {
  console.log('🎨 FileUpload render - uploadedFile:', uploadedFile);
  console.log('🎨 FileUpload render - resetKey:', resetKey);
}, [uploadedFile, resetKey]);
```

**Результат:** Теперь в Console будет видно, когда компонент ререндерится и какое состояние `uploadedFile`.

---

## 🔍 Что нужно проверить дальше:

### 1. Worker логи (КРИТИЧНО!)

**Проблема:** Сообщения создаются в outbox, но не обрабатываются worker'ом.

**Действия:**
1. Отправьте файл
2. Подождите 5-10 секунд
3. Откройте Render Dashboard → `fastprep-admin-worker` → **Logs**
4. Проверьте логи

**Что должно быть:**
- `📊 Pending outbox stats: { count: '1', ready_count: '1', ... }`
- `leaseBatch() returned 1 rows`
- `📤 Calling sendViaTelegram: hasObjectKey=true, objectKey=inbox/...`
- `📥 Downloading file from S3: inbox/...`
- `✅ File sent via Telegram`

**Если `count: '0'`:**
- Проблема в SQL запросе `leaseBatch()` или статусе `outbox.status`
- Нужно будет исправить `worker.service.ts`

---

### 2. UI отображение прикрепленного файла

**Проблема:** Файл загружается, но не видно индикатора в UI перед отправкой.

**Действия:**
1. Откройте Console (F12)
2. Прикрепите файл (не отправляйте)
3. Проверьте логи:
   - `🎨 FileUpload render - uploadedFile:` должно показать объект с `filename`, `size`, `contentType`
   - Если `uploadedFile: null` → файл не устанавливается после загрузки
   - Если `uploadedFile` есть, но UI не показывает → проблема в CSS или ререндере

**Возможные причины:**
- `setUploadedFile` вызывается, но компонент не ререндерится
- CSS скрывает компонент (`display: none` или `visibility: hidden`)
- Компонент отрендерился, но вне видимой области

---

### 3. Входящие файлы не открываются

**Действия:**
1. Откройте Console (F12) и Network tab
2. Кликните на входящий файл (изображение или "Document")
3. Проверьте:
   - Console: есть ли ошибки?
   - Network: есть ли GET запрос к `/api/inbox/uploads/download/...`?
   - Response: содержит ли presigned URL?

**Возможные проблемы:**
- Ошибка CORS
- 404 Not Found (файл не найден в S3)
- 401 Unauthorized (проблема с авторизацией)
- Presigned URL истек (нужно увеличить `expiresIn`)

---

## Следующие шаги:

1. **Деплой исправлений** (backend теперь возвращает `object_key`)
2. **Проверить Worker логи** - если не обрабатывает, исправить
3. **Проверить UI логи** - понять, почему не отображается прикрепленный файл
4. **Проверить входящие файлы** - найти ошибку в Console/Network

