import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  const secret = process.env.COMMUNICATION_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || 'fallback-encryption-secret-key-32-chars!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a text string securely using AES-256-CBC.
 */
export function encrypt(text: string): string {
  if (!text) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an AES-256-CBC encrypted string.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const key = getEncryptionKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 2) throw new Error('Invalid encrypted format');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    console.error('[COMM_DECRYPT_ERROR] Decryption failed:', err.message);
    // Return original if decryption failed and it wasn't encrypted (sandbox fallback support)
    if (!encryptedText.includes(':')) return encryptedText;
    throw err;
  }
}
