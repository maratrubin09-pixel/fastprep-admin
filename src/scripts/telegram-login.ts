import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';
import * as path from 'path';
import * as fs from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function login() {
  const apiId = parseInt(process.env.TG_API_ID || '0', 10);
  const apiHash = process.env.TG_API_HASH || '';
  const tdlibDir = process.env.TDLIB_DIR || '/var/data/tdlib';
  const phoneNumber = process.env.TG_PHONE_NUMBER || '';
  const sessionFile = path.join(tdlibDir, 'session.txt');

  if (!apiId || !apiHash) {
    console.error('❌ TG_API_ID and TG_API_HASH must be set');
    process.exit(1);
  }

  if (!phoneNumber) {
    console.error('❌ TG_PHONE_NUMBER must be set');
    process.exit(1);
  }

  console.log('🔐 Initializing Telegram client...');
  console.log(`📁 Session file: ${sessionFile}`);

  // Ensure directory exists
  if (!fs.existsSync(tdlibDir)) {
    fs.mkdirSync(tdlibDir, { recursive: true });
  }

  // Load session if exists
  let sessionString = '';
  if (fs.existsSync(sessionFile)) {
    sessionString = fs.readFileSync(sessionFile, 'utf8');
    console.log('📂 Loaded existing session');
  }

  const stringSession = new StringSession(sessionString);

  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  try {
    console.log('📞 Connecting to Telegram...');
    
    await client.start({
      phoneNumber: async () => phoneNumber,
      password: async () => {
        const pwd = await question('Enter your 2FA password (if enabled): ');
        return pwd.trim();
      },
      phoneCode: async () => {
        const code = await question('Enter the code from Telegram: ');
        return code.trim();
      },
      onError: (err) => {
        console.error('❌ Error:', err);
      },
    });

    console.log('\n✅ Login successful!');

    // Save session
    const session = client.session.save() as unknown as string;
    fs.writeFileSync(sessionFile, session, 'utf8');
    console.log(`📝 Session saved to: ${sessionFile}`);

    const me = await client.getMe();
    console.log(`👤 Logged in as: ${(me as any).firstName} ${(me as any).lastName || ''} (@${(me as any).username || 'N/A'})`);
    console.log(`📱 Phone: ${(me as any).phone}`);

    await client.disconnect();
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Login failed:', error);
    await client.disconnect();
    rl.close();
    process.exit(1);
  }
}

login();
