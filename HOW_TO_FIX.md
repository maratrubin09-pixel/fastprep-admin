# Как исправить синтаксические ошибки в telegram.service.ts

Файл: `/Users/maratrubin/fastprep-admin/src/messengers/telegram/telegram.service.ts`

## Проблема:
Строки 390-407 имеют неправильные отступы, и блок `if (entity)` не закрыт перед `catch`.

## Решение:

### 1. Исправьте отступы в строках 390-401:

**Сейчас (неправильно):**
```typescript
            if (!senderFirstName) senderFirstName = entityFirstName;
            if (!senderLastName) senderLastName = entityLastName;
            if (!senderUsername) senderUsername = entityUsername;
            if (!senderPhone) senderPhone = entityPhone;
            
            const name = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || entityUsername || entityPhone;
            if (name && senderName === 'Unknown') {
              senderName = name;
              chatTitle = name;
            } else if (entityTitle && chatTitle === 'Unknown') {
              chatTitle = entityTitle;
            }
```

**Должно быть (правильно):**
```typescript
              if (!senderFirstName) senderFirstName = entityFirstName;
              if (!senderLastName) senderLastName = entityLastName;
              if (!senderUsername) senderUsername = entityUsername;
              if (!senderPhone) senderPhone = entityPhone;
              
              const name = `${senderFirstName || ''} ${senderLastName || ''}`.trim() || entityUsername || entityPhone;
              if (name && senderName === 'Unknown') {
                senderName = name;
                chatTitle = name;
                this.logger.log(`✅ Method 2b - Updated senderName: ${senderName}, chatTitle: ${chatTitle}`);
              } else if (entityTitle && chatTitle === 'Unknown') {
                chatTitle = entityTitle;
                this.logger.log(`✅ Method 2b - Updated chatTitle: ${chatTitle}`);
              }
```

### 2. Исправьте строки 402-405:

**Сейчас:**
```typescript
          } else if (entityTitle && chatTitle === 'Unknown') {
            // Для групповых чатов используем title
            chatTitle = entityTitle;
          }
```

**Должно быть:**
```typescript
            } else if (entityTitle && chatTitle === 'Unknown') {
              // Для групповых чатов используем title
              chatTitle = entityTitle;
              this.logger.log(`✅ Method 2b - Updated chatTitle (group): ${chatTitle}`);
            }
```

### 3. Исправьте строку 407 и добавьте else блок:

**Сейчас (строка 407):**
```typescript
          this.logger.log(`✅ Got entity info: chatTitle=${chatTitle}, senderName=${senderName}`);
        } catch (error: any) {
```

**Должно быть:**
```typescript
            this.logger.log(`✅ Got entity info: chatTitle=${chatTitle}, senderName=${senderName}`);
          } else {
            this.logger.warn(`⚠️ Method 2b - Could not get entity (new chat or access denied)`);
          }
        } catch (error: any) {
```

## Итог:
- Строки 390-401: добавить 2 пробела в начале каждой строки (они внутри `if (User)`)
- Строки 402-405: исправить отступы и добавить logger.log
- Строка 407: изменить отступ и добавить `} else { ... }` блок перед `catch`

После исправления все синтаксические ошибки должны исчезнуть!

