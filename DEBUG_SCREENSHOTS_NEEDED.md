# Какие скриншоты нужны для диагностики проблем с файлами

## Проблемы:
1. Файл подгружается, но не видно что он добавился (нет визуального индикатора)
2. Получателю не доходят файлы
3. Входящие файлы не открываются

---

## Скриншот 1: Console при прикреплении файла

**Шаги:**
1. Откройте DevTools (F12) → вкладка **Console**
2. Нажмите на иконку скрепки (📎) в чате
3. Выберите файл (изображение, видео или документ)
4. **НЕ нажимайте Send**
5. Сделайте скриншот Console со всеми логами

**Что должно быть в логах:**
- `Starting file upload: Object`
- `Requesting presigned URL from: ...`
- `Presign response status: 201`
- `Got presigned URL, objectKey: inbox/...`
- `Uploading file to S3...`
- `S3 upload response status: 200`
- `✅ File uploaded to S3 successfully`
- `📎 FileUpload callback: objectKey= inbox/...`

**Если чего-то нет** → проблема в загрузке файла в S3.

---

## Скриншот 2: UI после прикрепления файла (ПЕРЕД отправкой)

**Шаги:**
1. Прикрепите файл (как в Скриншоте 1)
2. **НЕ нажимайте Send**
3. Сделайте скриншот области ввода сообщения (поле "Type a message..." и кнопка "Send")

**Что должно быть:**
- Должен появиться серый/фиолетовый прямоугольник с:
  - Иконкой файла слева
  - Названием файла
  - Размером файла
  - Кнопкой удаления (X) справа

**Если этого нет** → проблема в компоненте FileUpload (не отображается `uploadedFile`).

---

## Скриншот 3: Console при отправке файла

**Шаги:**
1. Прикрепите файл
2. Нажмите "Send"
3. Сделайте скриншот Console со всеми логами после нажатия Send

**Что должно быть в логах:**
- `📎 FileUpload callback: objectKey= inbox/...` (ПЕРЕД отправкой)
- `🔍 Frontend sendMessage - text: ...`
- `📤 Sending message request: {threadId: '...', attachedFileKey: 'inbox/...', ...}`
- `📤 New message from server: Object`
- `📤 Object key: inbox/...` (НЕ undefined!)

**Если `attachedFileKey: '(none)'` или `Object key: undefined`** → проблема в передаче objectKey.

---

## Скриншот 4: Network tab при отправке файла (Payload)

**Шаги:**
1. Откройте DevTools (F12) → вкладка **Network**
2. Включите фильтр "Fetch/XHR"
3. Прикрепите файл и нажмите "Send"
4. Найдите POST запрос к `/api/inbox/conversations/:id/messages`
5. Кликните на этот запрос
6. Откройте вкладку **"Payload"** или **"Request"**
7. Сделайте скриншот

**Что должно быть в Payload:**
```json
{
  "text": "...",
  "objectKey": "inbox/2da76805-..._filename.png"
}
```

**Если `objectKey` отсутствует или `null`** → проблема в frontend отправке.

---

## Скриншот 5: Network tab при отправке файла (Response)

**Шаги:**
1. Тот же запрос, что в Скриншоте 4
2. Откройте вкладку **"Response"**
3. Сделайте скриншот

**Что должно быть в Response:**
- Статус: `201 Created`
- Body содержит объект с полями:
  - `id`
  - `object_key` или `objectKey`
  - `delivery_status: "queued"`
  - и другие поля сообщения

**Если статус 400, 500 или ошибка** → проблема в backend валидации или создании сообщения.

---

## Скриншот 6: Логи Render API после отправки файла

**Шаги:**
1. Отправьте файл (как в Скриншотах 3-5)
2. Откройте Render Dashboard → `fastprep-admin-api` → **Logs**
3. Сделайте скриншот логов после отправки

**Что должно быть в логах:**
- `📤 Creating outgoing message: threadId=..., hasObjectKey=true, objectKey=inbox/...`
- `📤 Full DTO received: {...}`
- `🔍 About to insert message: threadId=..., objectKey=inbox/...`
- `✅ Message created: id=..., hasObjectKey=true, objectKey=inbox/...`
- `✅ Outbox entry created: message_id=..., conversation_id=...`
- `✅ Transaction committed successfully for message ...`

**Если этих логов нет** → POST запрос не доходит до backend или падает на валидации.

---

## Скриншот 7: Логи Render Worker после отправки файла

**Шаги:**
1. После отправки файла (как в Скриншотах 3-6)
2. Подождите 5-10 секунд
3. Откройте Render Dashboard → `fastprep-admin-worker` → **Logs**
4. Сделайте скриншот логов

**Что должно быть в логах (через 5-10 секунд):**
- `📊 Pending outbox stats: { count: '1', ready_count: '1', ... }` (НЕ все нули!)
- `leaseBatch() returned 1 rows` (НЕ 0!)
- `📨 Processing message: id=..., hasObjectKey=true, objectKey=inbox/...`
- `📤 Calling sendViaTelegram: channelId=..., hasObjectKey=true, objectKey=inbox/...`
- `📥 Downloading file from S3: inbox/...`
- `✅ File downloaded from S3: ... bytes`
- `✅ File sent via Telegram: messageId=...`

**Если `count: '0'`** → сообщение не создается в outbox.
**Если нет логов о sendViaTelegram** → worker не обрабатывает сообщение.

---

## Скриншот 8: Console при клике на входящий файл

**Шаги:**
1. Найдите входящее файловое сообщение в чате (например, изображение)
2. Откройте DevTools (F12) → вкладка **Console**
3. Кликните на входящий файл (изображение или "Document")
4. Сделайте скриншот Console со всеми логами и ошибками

**Что должно быть в логах:**
- `🖼️ MediaPreview loading objectKey: inbox/...`
- `🔗 Requesting presigned URL: ...`
- `📥 Presigned URL response status: 200`
- `✅ Got presigned URL: ...`
- `✅ Image loaded successfully: inbox/...`

**Если есть ошибки:**
- `❌ Failed to get image URL: ...`
- `❌ Failed to load image: ...`
- `Failed to fetch` или `CORS error`
→ Проблема в загрузке presigned URL или доступе к S3.

---

## Скриншот 9: Network tab при клике на входящий файл

**Шаги:**
1. Откройте DevTools (F12) → вкладка **Network**
2. Кликните на входящий файл
3. Найдите GET запрос к `/api/inbox/uploads/download/...`
4. Кликните на этот запрос
5. Сделайте скриншот вкладок **Headers**, **Response**

**Что должно быть:**
- **Headers:**
  - Method: `GET`
  - URL: `.../api/inbox/uploads/download/inbox/...?url=true`
  - Status: `200 OK`
- **Response:**
  ```json
  {
    "url": "https://fastprepusaattachments.nyc3.digitaloceanspaces.com/..."
  }
  ```

**Если статус 400, 401, 404 или 500** → проблема в backend endpoint или авторизации.

---

## Скриншот 10: UI при клике на входящий файл

**Шаги:**
1. Кликните на входящий файл (изображение или "Document")
2. Сделайте скриншот всего экрана

**Что должно быть:**
- Для изображений: модальное окно с полноразмерным изображением (черный фон)
- Для документов: должно начаться скачивание файла

**Если ничего не происходит** → проблема в обработчике клика в MediaPreview компоненте.

---

## Приоритет скриншотов

**Критично (нужны в первую очередь):**
1. Скриншот 3 (Console при отправке) - покажет, передается ли objectKey
2. Скриншот 4 (Network Payload) - покажет, что отправляется на backend
3. Скриншот 6 (Render API логи) - покажет, создается ли сообщение в outbox
4. Скриншот 7 (Render Worker логи) - покажет, обрабатывается ли сообщение worker'ом

**Важно:**
5. Скриншот 2 (UI после прикрепления) - покажет, отображается ли файл в UI
6. Скриншот 8 (Console при клике) - покажет ошибки при открытии входящих

**Дополнительно:**
7. Скриншот 1, 5, 9, 10 - для полной диагностики

---

## Быстрая проверка

Если у вас мало времени, сделайте минимум эти скриншоты:
1. **Console при отправке файла** (Скриншот 3)
2. **Network Payload** (Скриншот 4)
3. **Render API логи** (Скриншот 6)

Этого должно быть достаточно, чтобы понять, где проблема.

