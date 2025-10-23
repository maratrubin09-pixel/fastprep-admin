# 📱 Real Messenger Integration Plan

## 🎯 Goal: Replace Mock with Real Integration

---

## ✅ WHAT'S DONE (MVP with Mock):

- ✅ Frontend UI with messenger cards
- ✅ Backend API endpoints
- ✅ Database schema
- ✅ Frontend ↔ Backend integration
- ✅ QR code dialog with real-time polling
- ✅ Auto-verification (mock)
- ✅ Connect/Disconnect flow

---

## 🚀 NEXT: Real WhatsApp Integration

### **Library**: `whatsapp-web.js`

### **Features**:
- Real QR code from WhatsApp Web
- Persistent sessions (file-based or DB)
- Receive incoming messages
- Send messages
- Get chat list
- Media support (images, videos, documents)

### **Implementation Steps**:

1. **Install Dependencies**:
   ```bash
   npm install whatsapp-web.js qrcode
   ```

2. **Update `WhatsAppService`**:
   - Initialize WhatsApp client with Puppeteer
   - Generate real QR code
   - Handle authentication events
   - Save session data
   - Listen for incoming messages
   - Send messages

3. **Session Management**:
   - Store session in `.wwebjs_auth` folder (gitignored)
   - Or store in PostgreSQL as JSONB
   - Restore session on restart

4. **Webhooks for Incoming Messages**:
   - Listen to `message` event
   - Save to `messages` table in DB
   - Broadcast via WebSocket to frontend

---

## 🔵 NEXT: Real Telegram Integration

### **Library**: `telegram` (gramjs)

### **Features**:
- Connect as Telegram client (not bot!)
- QR code login
- Phone number login
- 2FA support
- Read all chats
- Send messages
- Media support

### **Implementation Steps**:

1. **Install Dependencies**:
   ```bash
   npm install telegram
   ```

2. **Get Telegram API Credentials**:
   - Go to https://my.telegram.org/apps
   - Create an app
   - Get `api_id` and `api_hash`

3. **Update `TelegramService`**:
   - Initialize TelegramClient
   - Generate QR code or request phone number
   - Handle 2FA
   - Save session (StringSession)
   - Listen for new messages
   - Send messages

4. **Session Management**:
   - Store StringSession in database
   - Restore on reconnect

---

## 📊 Architecture:

```
User clicks "Connect WhatsApp"
         ↓
Backend: WhatsAppService.initConnection()
         ↓
Puppeteer launches Chrome (headless)
         ↓
WhatsApp Web loads → generates QR
         ↓
QR code converted to base64 image
         ↓
Returned to Frontend
         ↓
User scans QR with phone
         ↓
WhatsApp Web authenticates
         ↓
Session saved to disk/DB
         ↓
Status: Connected ✅
         ↓
Listen for incoming messages
         ↓
Save to DB → Broadcast via WebSocket
```

---

## 🔐 Security Considerations:

- ⚠️ **WhatsApp Web sessions are sensitive!**
  - Store in secure location
  - Encrypt session data
  - Don't commit to Git

- ⚠️ **Telegram sessions are sensitive!**
  - StringSession contains auth token
  - Encrypt in database
  - Use environment variables for API credentials

- ⚠️ **Render.com Deployment**:
  - Persistent storage needed for sessions
  - Use PostgreSQL to store session data
  - Or use external storage (S3, etc.)

---

## 📦 File Structure:

```
src/messengers/
├── whatsapp/
│   ├── whatsapp.service.ts (real implementation)
│   ├── whatsapp.client.ts (WhatsApp Web client wrapper)
│   └── whatsapp.types.ts
├── telegram/
│   ├── telegram.service.ts (real implementation)
│   ├── telegram.client.ts (GramJS client wrapper)
│   └── telegram.types.ts
├── instagram/
│   └── instagram.service.ts (TODO: later)
├── facebook/
│   └── facebook.service.ts (TODO: later)
└── messengers.service.ts (orchestrator)
```

---

## 🎯 MVP Scope (WhatsApp + Telegram):

### **Must Have**:
- ✅ Real QR code login
- ✅ Session persistence
- ✅ Receive messages
- ✅ Send messages
- ✅ Connection status

### **Nice to Have** (later):
- Media support (images, videos)
- Group chat support
- Message delivery status
- Typing indicators
- Read receipts

---

## 🚀 Deployment Notes:

### **Render.com**:
- Puppeteer/Chrome needed for WhatsApp Web
- May need custom Docker image
- Or use Puppeteer skip-chromium-download and chrome-aws-lambda

### **Environment Variables**:
```
# Telegram
TELEGRAM_API_ID=your_api_id
TELEGRAM_API_HASH=your_api_hash

# WhatsApp (optional)
WHATSAPP_SESSION_STORAGE=database # or 'filesystem'
```

---

## 📅 Timeline:

- **WhatsApp Real Integration**: ~3-4 hours
- **Telegram Real Integration**: ~3-4 hours
- **Testing & Debugging**: ~2 hours
- **Total**: ~8-10 hours

---

## ✅ Current Status: READY TO IMPLEMENT

**Next Step**: Start with WhatsApp real integration

**Command to run**:
```bash
cd /Users/maratrubin/fastprep-admin
npm install
# Then update WhatsAppService with real implementation
```

