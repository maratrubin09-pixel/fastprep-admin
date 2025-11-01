# Настройка CORS для S3 Bucket

Если при загрузке файлов возникает ошибка "Network error: Failed to connect to S3. This might be a CORS issue", нужно настроить CORS для вашего S3 bucket.

## 🔍 Где искать CORS настройки?

### 1. AWS S3

**Путь:**
1. Откройте [AWS Console](https://console.aws.amazon.com/s3/)
2. Выберите ваш bucket (имя указано в переменной `S3_BUCKET`)
3. Перейдите на вкладку **"Permissions"** (Разрешения)
4. Прокрутите вниз до секции **"Cross-origin resource sharing (CORS)"**
5. Нажмите **"Edit"** (Редактировать)

**Скриншот пути:** `AWS Console → S3 → [ваш bucket] → Permissions → CORS`

---

### 2. DigitalOcean Spaces

**Путь:**
1. Откройте [DigitalOcean Control Panel](https://cloud.digitalocean.com/spaces)
2. Выберите ваш Space (это и есть ваш bucket)
3. Перейдите на вкладку **"Settings"** (Настройки)
4. Найдите секцию **"CORS Configurations"**
5. Нажмите **"Edit CORS Configurations"**

**Скриншот пути:** `DigitalOcean → Spaces → [ваш space] → Settings → CORS Configurations`

---

### 3. Cloudflare R2

**Путь:**
1. Откройте [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Выберите ваш аккаунт
3. Перейдите в **R2** в боковом меню
4. Выберите ваш bucket
5. Перейдите на вкладку **"Settings"**
6. Найдите секцию **"CORS Policy"**
7. Нажмите **"Edit"**

**Скриншот пути:** `Cloudflare Dashboard → R2 → [ваш bucket] → Settings → CORS Policy`

---

### 4. Backblaze B2

**Путь:**
1. Откройте [Backblaze Control Panel](https://secure.backblaze.com/b2_buckets.htm)
2. Найдите ваш bucket
3. Нажмите на него, чтобы открыть детали
4. Найдите секцию **"CORS Rules"** или **"Lifecycle Settings"**
5. Нажмите **"Add CORS Rule"** или **"Edit"**

---

### 5. IONOS Object Storage

**Путь:**
1. Откройте [IONOS Cloud Panel](https://cloud.ionos.com/)
2. Войдите в ваш аккаунт
3. Перейдите в раздел **"Storage"** или **"Object Storage"**
4. Выберите ваш bucket
5. Найдите вкладку **"Settings"** или **"Configuration"**
6. Найдите секцию **"CORS Configuration"** или **"Cross-Origin Resource Sharing"**
7. Нажмите **"Edit"** или **"Add CORS Rule"**

**Скриншот пути:** `IONOS Cloud → Storage/Object Storage → [ваш bucket] → Settings → CORS Configuration`

**Важно для IONOS:**
- Endpoint обычно выглядит как: `s3.[region].ionoscloud.com` (например, `s3.de-central.ionoscloud.com`)
- Region обычно указывается как `de-central`, `us-west`, и т.д.
- Убедитесь, что используете правильный регион в переменной `S3_REGION`

---

### 6. Wasabi / MinIO / Другие S3-совместимые

**Обычно находится в:**
- Bucket → Settings → CORS
- Bucket → Permissions → CORS
- Bucket → Security → CORS

Ищите разделы: **"CORS"**, **"Cross-Origin Resource Sharing"**, или **"CORS Policy"**

3. **Добавьте следующую конфигурацию CORS:**

```json
[
    {
        "AllowedOrigins": [
            "https://admin.fastprepusa.com",
            "http://localhost:3000",
            "http://localhost:3001"
        ],
        "AllowedMethods": [
            "PUT",
            "GET",
            "HEAD",
            "POST"
        ],
        "AllowedHeaders": [
            "*"
        ],
        "ExposeHeaders": [
            "ETag",
            "x-amz-request-id",
            "x-amz-id-2"
        ],
        "MaxAgeSeconds": 3000
    }
]
```

4. **Сохраните изменения**

## Инструкция для других S3-совместимых хранилищ (DigitalOcean Spaces, Backblaze B2, etc.)

Для S3-совместимых хранилищ процесс похож, но интерфейс может отличаться:

1. Найдите секцию CORS в настройках bucket
2. Добавьте ту же конфигурацию, что указана выше
3. Убедитесь, что ваш домен `admin.fastprepusa.com` добавлен в `AllowedOrigins`

## Проверка после настройки

После настройки CORS:
1. Подождите 1-2 минуты (изменения могут применяться не сразу)
2. Попробуйте загрузить файл снова
3. Откройте консоль браузера (F12) - не должно быть ошибок CORS

## Важные моменты

- **AllowedOrigins** должен содержать точный домен вашего фронтенда (без trailing slash)
- Для разработки добавьте `http://localhost:3000` (или другой порт, который используете)
- **AllowedMethods** должен включать `PUT` (для загрузки файлов)
- **AllowedHeaders** можно оставить `["*"]` для простоты, или указать конкретные заголовки

## Если проблема не решается

1. Проверьте, что bucket существует и доступен
2. Проверьте, что переменные окружения `S3_ENDPOINT`, `S3_BUCKET` настроены правильно
3. Проверьте права доступа к bucket (bucket policy)
4. Проверьте в консоли браузера точную ошибку CORS

---

## Получение Access Keys для DigitalOcean Spaces

### Вариант 1: Использовать существующий ключ (если Secret уже сохранен)

Если у вас уже есть Access Key (например, "portal"), и вы сохранили Secret Access Key, вы можете использовать его.

**Важно:** Secret Access Key показывается только один раз при создании ключа. Если вы его не сохранили, нужно создать новый ключ.

### Вариант 2: Создать новый Access Key

1. **В DigitalOcean Console:**
   - Откройте ваш Spaces Bucket
   - Перейдите в **Settings** → **Access Keys**
   - Нажмите **"Create Access Key"**

2. **Настройте новый ключ:**
   - **Access Key Name:** Например, `fastprep-admin` или `inbox-attachments`
   - **Buckets:** Выберите конкретный бакет (`fastprepusaattachments`) или "All buckets"
   - **Permissions:** Минимум нужны `Read` и `Write` (можно выбрать "All Permissions" для простоты)

3. **Скопируйте данные:**
   - **Access Key ID** — скопируйте сразу
   - **Secret Access Key** — **скопируйте и сохраните БЕЗОПАСНО** (показывается только один раз!)

### Настройка переменных окружения в Render

После получения Access Keys обновите переменные окружения в Render:

1. **Откройте ваш сервис в Render Dashboard**
2. **Перейдите в Environment**
3. **Добавьте/обновите следующие переменные:**

```bash
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=fastprepusaattachments
S3_ACCESS_KEY_ID=DO00TWG4AKFFQB  # Ваш Access Key ID
S3_SECRET_ACCESS_KEY=your_secret_key_here  # Ваш Secret Access Key
```

**Важно:** 
- `S3_ENDPOINT` должен быть в формате `https://{region}.digitaloceanspaces.com`
- Регион `nyc3` может отличаться — проверьте в настройках вашего Spaces Bucket
- Secret Access Key должен быть **точной копией** без лишних пробелов

4. **Сохраните переменные** и перезапустите сервис

### Проверка правильности ключей

После настройки:
1. Попробуйте загрузить файл через UI
2. Проверьте логи в Render — не должно быть ошибок `InvalidAccessKeyId` или `SignatureDoesNotMatch`
3. Если есть ошибки — проверьте, что ключи скопированы правильно (без пробелов в начале/конце)

