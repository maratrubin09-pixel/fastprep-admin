import { Client } from 'tdl';
import * as readline from 'readline';

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
  const encryptionKey = process.env.TDLIB_ENCRYPTION_KEY || '';
  const phoneNumber = process.env.TG_PHONE_NUMBER || '';

  if (!apiId || !apiHash) {
    console.error('❌ TG_API_ID and TG_API_HASH must be set');
    process.exit(1);
  }

  if (!encryptionKey || encryptionKey.length < 32) {
    console.error('❌ TDLIB_ENCRYPTION_KEY must be at least 32 characters');
    process.exit(1);
  }

  console.log('🔐 Initializing Telegram client...');
  console.log(`📁 Session directory: ${tdlibDir}`);

  const client = new Client({
    apiId,
    apiHash,
    databaseDirectory: `${tdlibDir}/db`,
    filesDirectory: `${tdlibDir}/files`,
    databaseEncryptionKey: encryptionKey,
    useTestDc: false,
  });

  client.on('error', (err) => {
    console.error('❌ TDLib Error:', err);
  });

  client.on('update', (update) => {
    if (update._ === 'updateAuthorizationState') {
      console.log('📱 Auth state:', update.authorization_state._);
    }
  });

  await client.connect();

  // Handle authentication flow
  try {
    const authState = await client.invoke({
      _: 'getAuthorizationState',
    });

    console.log('Current auth state:', authState._);

    if (authState._ === 'authorizationStateWaitPhoneNumber') {
      console.log(`\n📞 Sending phone number: ${phoneNumber}`);
      await client.invoke({
        _: 'setAuthenticationPhoneNumber',
        phone_number: phoneNumber,
      });

      console.log('⏳ Waiting for code...');
      const code = await question('Enter the code from Telegram: ');

      await client.invoke({
        _: 'checkAuthenticationCode',
        code: code.trim(),
      });
    }

    if (authState._ === 'authorizationStateWaitPassword') {
      console.log('\n🔐 2FA is enabled');
      const password = await question('Enter your 2FA password: ');

      await client.invoke({
        _: 'checkAuthenticationPassword',
        password: password.trim(),
      });
    }

    // Wait for ready state
    await new Promise((resolve) => {
      const checkAuth = setInterval(async () => {
        const state = await client.invoke({ _: 'getAuthorizationState' });
        if (state._ === 'authorizationStateReady') {
          clearInterval(checkAuth);
          resolve(true);
        }
      }, 1000);
    });

    console.log('\n✅ Login successful!');
    console.log('📝 Session saved to:', tdlibDir);

    const me = await client.invoke({ _: 'getMe' });
    console.log(`👤 Logged in as: ${me.first_name} ${me.last_name || ''} (@${me.username || 'N/A'})`);
    console.log(`📱 Phone: ${me.phone_number}`);

    await client.close();
    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Login failed:', error);
    await client.close();
    rl.close();
    process.exit(1);
  }
}

login();

