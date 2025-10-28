import { Injectable } from '@nestjs/common';

@Injectable()
export class InstagramService {
  private sessions = new Map<string, any>();

  async initConnection(userId: string, data: any) {
    // TODO: Implement Instagram connection (likely via unofficial API or web automation)
    const sessionId = `instagram_${userId}_${Date.now()}`;
    
    this.sessions.set(userId, {
      sessionId,
      status: 'pending',
      qrCode: 'mock_qr_code_data',
      createdAt: new Date(),
    });

    return {
      sessionId,
      qrCode: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23f0f0f0"/><text x="50%" y="50%" font-size="12" text-anchor="middle" dy=".3em">Instagram QR Code</text></svg>',
      message: 'Scan QR code with Instagram app to connect',
    };
  }

  async getQrCode(userId: string) {
    const session = this.sessions.get(userId);
    if (!session) {
      throw new Error('No active session found');
    }

    return session.qrCode;
  }

  async verifyConnection(userId: string) {
    // TODO: Verify Instagram connection
    const session = this.sessions.get(userId);
    if (!session) return false;

    const elapsed = Date.now() - session.createdAt.getTime();
    return elapsed > 5000;
  }

  async getAccountInfo(userId: string) {
    // TODO: Get real Instagram account info
    return {
      accountName: 'Instagram Business',
      username: '@fastprepusa',
      connectedAt: new Date(),
    };
  }

  async disconnect(userId: string) {
    // TODO: Properly disconnect Instagram session
    this.sessions.delete(userId);
  }

  async sendMessage(userId: string, threadId: string, message: string) {
    // TODO: Send Instagram DM
    console.log(`Sending Instagram message from ${userId} to ${threadId}: ${message}`);
    return { success: true, messageId: `ig_${Date.now()}` };
  }

  async getMessages(userId: string, threadId: string) {
    // TODO: Fetch Instagram DMs
    return [];
  }
}


