import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { CommunicationProvider, SendMessagePayload, SendResult } from '../types';

export class FirebasePushProvider implements CommunicationProvider {
  private client: Messaging | null = null;
  private sandboxMode = true;

  async connect(config: any): Promise<void> {
    const serviceAccountJson = config.serviceAccountJson || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    if (serviceAccountJson) {
      try {
        if (getApps().length === 0) {
          const serviceAccount = typeof serviceAccountJson === 'string'
            ? JSON.parse(serviceAccountJson)
            : serviceAccountJson;
          initializeApp({
            credential: cert(serviceAccount),
          });
        }
        this.client = getMessaging();
        this.sandboxMode = false;
      } catch (err: any) {
        console.error('[FIREBASE_PROVIDER] Initialization failed:', err.message);
        this.sandboxMode = true;
      }
    } else {
      this.client = null;
      this.sandboxMode = true;
      console.log('[FIREBASE_PROVIDER] No service account JSON provided. Running in Sandbox Mode.');
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
  }

  async health(): Promise<{ status: 'healthy' | 'error'; message?: string }> {
    if (this.sandboxMode) {
      return { status: 'healthy', message: 'Sandbox Mode active (Local console mocks)' };
    }
    if (!this.client) {
      return { status: 'error', message: 'Client not initialized' };
    }
    return { status: 'healthy', message: 'Firebase Admin SDK initialized, connected to FCM' };
  }

  async send(payload: SendMessagePayload): Promise<SendResult> {
    if (this.sandboxMode || !this.client) {
      console.log(`[FIREBASE_SANDBOX_SEND] Token: ${payload.to}, Title: ${payload.subject}\nBody: ${payload.body}`);
      return {
        providerMessageId: `sandbox-fcm-${Math.random().toString(36).substring(2, 11)}`,
        status: 'sent',
        rawResponse: { sandbox: true, timestamp: new Date().toISOString() }
      };
    }

    try {
      const message = {
        notification: {
          title: payload.subject || 'PANTHER Notification',
          body: payload.body,
        },
        data: payload.metadata ? Object.keys(payload.metadata).reduce((acc, key) => {
          acc[key] = String(payload.metadata?.[key]);
          return acc;
        }, {} as Record<string, string>) : {},
        token: payload.to,
      };

      const response = await this.client.send(message);

      return {
        providerMessageId: response,
        status: 'sent',
        rawResponse: { response }
      };
    } catch (err: any) {
      return {
        providerMessageId: '',
        status: 'failed',
        error: err.message
      };
    }
  }

  async sendBulk(payloads: SendMessagePayload[]): Promise<SendResult[]> {
    if (this.sandboxMode || !this.client) {
      const results: SendResult[] = [];
      for (const p of payloads) {
        results.push(await this.send(p));
      }
      return results;
    }

    try {
      const tokens = payloads.map(p => p.to);
      const firstPayload = payloads[0];
      
      const message = {
        notification: {
          title: firstPayload?.subject || 'PANTHER Notification',
          body: firstPayload?.body || '',
        },
        data: firstPayload?.metadata ? Object.keys(firstPayload.metadata).reduce((acc, key) => {
          acc[key] = String(firstPayload.metadata?.[key]);
          return acc;
        }, {} as Record<string, string>) : {},
        tokens: tokens,
      };

      const response = await this.client.sendEachForMulticast(message);
      
      return response.responses.map((res, idx) => {
        if (res.success) {
          return {
            providerMessageId: res.messageId || `fcm-bulk-${idx}`,
            status: 'sent',
            rawResponse: res
          };
        } else {
          return {
            providerMessageId: '',
            status: 'failed',
            error: res.error?.message || 'FCM delivery failed',
            rawResponse: res
          };
        }
      });
    } catch (err: any) {
      return payloads.map(() => ({
        providerMessageId: '',
        status: 'failed',
        error: err.message
      }));
    }
  }

  async validate(template: string, variables: Record<string, string>): Promise<boolean> {
    return typeof template === 'string' && template.length > 0;
  }

  async preview(template: string, variables: Record<string, string>): Promise<string> {
    let result = template;
    for (const [key, val] of Object.entries(variables)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), val || '');
    }
    return result;
  }
}
export default FirebasePushProvider;
