# Реализация кликабельных ссылок в чате

## Вариант 1: Библиотека `linkify-react` (Рекомендуется) ⭐

### Установка:
```bash
npm install linkify-react
```

### Использование:
```jsx
import Linkify from 'linkify-react';

// В компоненте сообщения:
<Typography variant="body1">
  <Linkify 
    options={{
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 'message-link'
    }}
  >
    {msg.text}
  </Linkify>
</Typography>
```

### Преимущества:
- ✅ Простая интеграция (1 строка кода)
- ✅ Автоматически определяет все виды ссылок (http, https, www, email)
- ✅ Безопасность встроена (target="_blank", rel="noopener")
- ✅ Кастомизация через options
- ✅ Размер библиотеки: ~20KB

### Стилизация:
```jsx
import Linkify from 'linkify-react';
import { styled } from '@mui/material';

const StyledLinkify = styled(Linkify)(({ theme }) => ({
  '& a': {
    color: 'inherit',
    textDecoration: 'underline',
    '&:hover': {
      opacity: 0.8,
    },
  },
}));
```

---

## Вариант 2: Собственная функция (Без зависимостей)

### Реализация:
```jsx
const LinkifyText = ({ text, linkColor = 'primary' }) => {
  // Регулярное выражение для поиска URL
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[^\s]+@[^\s]+\.[^\s]+)/g;
  
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = urlRegex.exec(text)) !== null) {
    // Текст до ссылки
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index)
      });
    }
    
    // Ссылка
    let url = match[0];
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('@')) {
        // Email
        url = `mailto:${url}`;
      } else {
        // www или другой протокол
        url = `https://${url}`;
      }
    }
    
    parts.push({
      type: 'link',
      content: match[0],
      url: url
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Остаток текста
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex)
    });
  }
  
  // Если ссылок не найдено, возвращаем обычный текст
  if (parts.length === 0) {
    return <>{text}</>;
  }
  
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === 'link') {
          return (
            <Link
              key={index}
              href={part.url}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                color: linkColor === 'primary' ? 'inherit' : linkColor,
                textDecoration: 'underline',
                '&:hover': {
                  opacity: 0.8,
                },
              }}
            >
              {part.content}
            </Link>
          );
        }
        return <span key={index}>{part.content}</span>;
      })}
    </>
  );
};

// Использование:
<Typography variant="body1">
  <LinkifyText text={msg.text} linkColor="inherit" />
</Typography>
```

### Преимущества:
- ✅ Нет зависимостей
- ✅ Полный контроль над логикой
- ✅ Можно кастомизировать под нужды

### Недостатки:
- ❌ Нужно тестировать регулярные выражения
- ❌ Может не покрывать все случаи (сложные URL)
- ❌ Нужно обрабатывать edge cases

---

## Вариант 3: Простая функция с dangerouslySetInnerHTML (НЕ рекомендуется)

```jsx
const linkify = (text) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
  });
};

// Использование (ОПАСНО!):
<Typography 
  variant="body1" 
  dangerouslySetInnerHTML={{ __html: linkify(msg.text) }}
/>
```

**НЕ рекомендуется** из-за XSS уязвимостей.

---

## Рекомендация

### Для быстрого решения: Вариант 1 (`linkify-react`)
- Устанавливаем: `npm install linkify-react`
- Добавляем компонент в `InboxPage.js`
- Готово за 5 минут

### Для долгосрочного решения без зависимостей: Вариант 2
- Создаем компонент `LinkifyText.js`
- Используем в `InboxPage.js`
- Полный контроль, но нужно тестировать

---

## Примеры ссылок, которые должны работать:

- `https://example.com` ✅
- `http://example.com` ✅
- `www.example.com` ✅
- `example.com` (может не определиться)
- `user@example.com` ✅
- `Check this: https://example.com/page?q=test` ✅

---

## Стилизация для разных направлений сообщений:

```jsx
// Для исходящих (белый текст на синем фоне)
<LinkifyText 
  text={msg.text} 
  linkColor="#ffffff" // Белая ссылка
/>

// Для входящих (темный текст на сером фоне)
<LinkifyText 
  text={msg.text} 
  linkColor="primary.main" // Цветная ссылка
/>
```

---

## Безопасность

Всегда используем:
- `target="_blank"` - открывать в новой вкладке
- `rel="noopener noreferrer"` - предотвращает уязвимости типа `window.opener`

---

## Какой вариант выбираем?

Рекомендую **Вариант 1** (`linkify-react`) для быстрого решения.
Если важно избежать зависимостей - **Вариант 2** (собственная функция).

