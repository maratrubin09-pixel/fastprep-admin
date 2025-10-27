#!/usr/bin/env bash
set -euo pipefail

EMAIL="marat.rubin09@gmail.com"
KEYFILE="$HOME/.ssh/id_ed25519_fastprep"

echo "🚀 FastPrep Admin: GitHub SSH Setup Script"
echo "==========================================="

# Создаём .ssh директорию если нет
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"

# Проверяем существующий ключ
if [ -f "$KEYFILE" ]; then
  echo "✅ SSH key already exists: $KEYFILE"
else
  echo "🔑 Generating new SSH key: $KEYFILE"
  ssh-keygen -t ed25519 -C "$EMAIL" -f "$KEYFILE" -N ""
  echo "✅ SSH key generated successfully"
fi

# Стартуем ssh-agent
echo "🔧 Starting ssh-agent..."
eval "$(ssh-agent -s)"

# Добавляем ключ (macOS-friendly с Keychain)
echo "🔐 Adding key to ssh-agent and Apple Keychain..."
if /usr/bin/ssh-add --apple-use-keychain "$KEYFILE" 2>/dev/null; then
  echo "✅ Key added to Keychain"
else
  ssh-add "$KEYFILE"
  echo "✅ Key added to ssh-agent"
fi

# Создаём SSH config для GitHub если отсутствует
if ! grep -q "Host github.com" "$HOME/.ssh/config" 2>/dev/null; then
  echo "📝 Creating SSH config for GitHub..."
  cat >>"$HOME/.ssh/config" <<EOF

Host github.com
  HostName github.com
  User git
  IdentityFile $KEYFILE
  AddKeysToAgent yes
  UseKeychain yes
EOF
  chmod 600 "$HOME/.ssh/config"
  echo "✅ SSH config created"
else
  echo "✅ SSH config already exists"
fi

# Показываем публичный ключ
echo ""
echo "📋 PUBLIC KEY (copy this to GitHub):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat "$KEYFILE.pub"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Инициализируем git, если нужно
if [ ! -d ".git" ]; then
  echo "🔧 Initializing git repository..."
  git init
  git add .
  git commit -m "Initial commit: FastPrep Admin"
  git branch -M main
  echo "✅ Git initialized and committed"
else
  echo "✅ Git repository already initialized"
fi

# Настраиваем SSH remote
echo "🔗 Setting up GitHub remote (SSH)..."
git remote remove origin 2>/dev/null || true
git remote add origin git@github.com:maratrubin09-pixel/fastprep-admin.git
echo "✅ Remote configured: git@github.com:maratrubin09-pixel/fastprep-admin.git"

echo ""
echo "📖 NEXT STEPS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "1. Open: https://github.com/settings/keys"
echo "2. Click: 'New SSH key'"
echo "3. Title: 'FastPrep Admin Mac'"
echo "4. Paste the PUBLIC KEY from above"
echo "5. Click: 'Add SSH key'"
echo ""
echo "After adding the key to GitHub, test connection:"
echo "  $ ssh -T git@github.com"
echo "  (should respond: Hi maratrubin09-pixel!)"
echo ""
echo "Then push your code:"
echo "  $ git push -u origin main"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"






