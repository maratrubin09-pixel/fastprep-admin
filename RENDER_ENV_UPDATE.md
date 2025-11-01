# Обновление переменных окружения в Render

## Проблема
При попытке загрузить файл возникает ошибка: "Network error: Failed to connect to S3. This might be a CORS issue."

## Решение

### 1. Обновите переменные окружения в Render Dashboard

1. Откройте https://dashboard.render.com
2. Найдите сервис **fastprep-admin-api**
3. Перейдите в раздел **Environment** (в меню слева)
4. Обновите следующие переменные:

#### S3 Credentials (новые ключи из DigitalOcean Spaces)
```
S3_ACCESS_KEY_ID = DO801JNP37MLGUC
S3_SECRET_ACCESS_KEY = Rcii5w+n4ZXepAa/ERRDWSSo4mTL+PFqcOU
```

#### S3 Endpoint и Region
```
S3_ENDPOINT = https://nyc3.digitaloceanspaces.com
S3_REGION = nyc3
S3_BUCKET = fastprepusaattachments
```

**Важно:** 
- Убедитесь, что регион (`nyc3`) соответствует региону вашего Spaces bucket
- Если ваш bucket в другом регионе, замените `nyc3` на правильный регион (например, `ams3`, `sgp1`, `sfo3`, `fra1`)

### 2. Проверка региона

Если вы не уверены в регионе:
1. Откройте DigitalOcean Spaces
2. Выберите bucket `fastprepusaattachments`
3. В настройках CDN или в URL файлов будет указан регион

### 3. Перезапуск

После обновления переменных:
- Render автоматически перезапустит сервис
- Подождите 1-2 минуты
- Проверьте логи в Render для подтверждения успешного запуска

### 4. Проверка работы

После перезапуска:
1. Откройте https://admin.fastprepusa.com/messages/inbox
2. Выберите чат
3. Попробуйте прикрепить и отправить файл
4. Проверьте, что файлы открываются (входящие и исходящие)

### 5. Если проблема сохраняется

Проверьте логи в Render:
1. Откройте **Logs** для сервиса `fastprep-admin-api`
2. Ищите ошибки типа:
   - `InvalidAccessKeyId`
   - `SignatureDoesNotMatch`
   - `AccessDenied`
   - `Failed to connect`

Если видите эти ошибки:
- Убедитесь, что скопировали правильные ключи (без пробелов)
- Проверьте, что Access Key имеет права `Read/Write/Delete` для bucket `fastprepusaattachments`
- Проверьте, что `S3_ENDPOINT` правильный (с `https://` в начале)

