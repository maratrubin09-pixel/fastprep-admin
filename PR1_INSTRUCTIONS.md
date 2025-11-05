# PR1: ESLint + Prettier - Инструкция

## ✅ Что сделано:

1. Добавлены зависимости ESLint/Prettier в `package.json`
2. Обновлены скрипты `lint` и `format`
3. Конфигурационные файлы должны быть созданы

## 📝 Следующие шаги:

### 1. Установить зависимости:
```bash
cd /Users/maratrubin/fastprep-admin
npm install
```

### 2. Проверить/создать конфигурационные файлы:

Если файлов нет, создайте:

**.eslintrc.json:**
```json
{
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "plugins": ["@typescript-eslint", "prettier"],
  "rules": {
    "prettier/prettier": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  },
  "ignorePatterns": ["dist/", "node_modules/", "*.js", "frontend/"]
}
```

**.prettierrc:**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "avoid"
}
```

**.prettierignore:**
```
node_modules/
dist/
build/
*.min.js
*.min.css
package-lock.json
coverage/
.nyc_output/
```

### 3. Применить ESLint и Prettier:
```bash
npm run lint
npm run format
```

### 4. Проверить изменения:
```bash
git status
```

### 5. Закоммитить (если все хорошо):
```bash
git add -A
git commit -m "style: eslint/prettier cleanup (no logic changes)"
```

## ⚠️ Важно:

- **Без изменения логики** - только форматирование кода
- Проверить, что сборка работает: `npm run build`




