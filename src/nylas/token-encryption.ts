import * as CryptoJS from 'crypto-js';

/**
 * Encryption service for Nylas tokens
 */
export class TokenEncryption {
  private static readonly SECRET_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production';

  /**
   * Encrypt token
   */
  static encrypt(token: string): string {
    return CryptoJS.AES.encrypt(token, this.SECRET_KEY).toString();
  }

  /**
   * Decrypt token
   */
  static decrypt(encryptedToken: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedToken, this.SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  }
}


