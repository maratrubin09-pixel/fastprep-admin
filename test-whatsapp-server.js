// Минимальный сервер только для тестирования WhatsApp
const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

const sessions = new Map();
const BAILEYS_DIR = path.join(__dirname, 'baileys_sessions');

// Helper logger
const logger = {
  level: 'error',
  fatal: (...args) => console.error('[Baileys FATAL]', ...args),
  error: (...args) => console.error('[Baileys ERROR]', ...args),
  warn: () => {},
  info: () => {},
  debug: () => {},
  trace: () => {},
  child: function() { return this; },
};

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-test-server' });
});

// POST /api/messengers/whatsapp/connect
app.post('/api/messengers/whatsapp/connect', async (req, res) => {
  const userId = 'test-user'; // Для теста используем фиксированный ID
  
  try {
    console.log('📞 WhatsApp connect request');
    
    const sessionDir = path.join(BAILEYS_DIR, `session_${userId}`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();
    
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      browser: ['Chrome', '120.0.0', 'Windows'],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 20000,
      keepAliveIntervalMs: 15000,
      logger: logger,
    });

    const session = {
      sock,
      status: 'initializing',
      qrCode: null,
      createdAt: new Date(),
    };

    sessions.set(userId, session);

    // QR code event
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('✅ QR code generated');
        try {
          const qrCodeDataUrl = await qrcode.toDataURL(qr);
          session.qrCode = qrCodeDataUrl;
          session.status = 'qr_ready';
        } catch (err) {
          console.error('Error generating QR code:', err);
        }
      }

      if (connection === 'open') {
        console.log('✅ WhatsApp connected!');
        session.status = 'ready';
      }

      if (connection === 'close') {
        console.log('❌ WhatsApp connection closed');
        session.status = 'disconnected';
      }
    });

    sock.ev.on('creds.update', saveCreds);

    res.json({ success: true, status: 'initializing' });
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/messengers/whatsapp/qr
app.get('/api/messengers/whatsapp/qr', (req, res) => {
  const userId = 'test-user';
  const session = sessions.get(userId);
  
  if (!session || !session.qrCode) {
    return res.status(404).json({ success: false, message: 'QR code not ready' });
  }
  
  res.json({ success: true, qrCode: session.qrCode });
});

// POST /api/messengers/whatsapp/verify
app.post('/api/messengers/whatsapp/verify', (req, res) => {
  const userId = 'test-user';
  const session = sessions.get(userId);
  
  if (!session) {
    return res.json({ success: true, result: { connected: false } });
  }
  
  res.json({ 
    success: true, 
    result: { connected: session.status === 'ready' } 
  });
});

const PORT = 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ WhatsApp Test Server listening on http://localhost:${PORT}`);
  console.log(`📱 Ready to test WhatsApp connection!\n`);
});

