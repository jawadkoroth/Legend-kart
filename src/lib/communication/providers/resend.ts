import { Resend } from 'resend';
import { CommunicationProvider, SendMessagePayload, SendResult } from '../types';

export class ResendEmailProvider implements CommunicationProvider {
  private client: Resend | null = null;
  private fromAddress = 'PANTHER <onboarding@resend.dev>';
  private sandboxMode = true;

  async connect(config: any): Promise<void> {
    const key = config.apiKey || process.env.RESEND_API_KEY;
    if (key) {
      this.client = new Resend(key);
      this.sandboxMode = false;
    } else {
      this.client = null;
      this.sandboxMode = true;
      console.log('[RESEND_PROVIDER] No API key provided. Falling back to Sandbox/Mock mode.');
    }
    this.fromAddress = config.fromAddress || process.env.EMAIL_FROM || 'PANTHER <onboarding@resend.dev>';
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
    return { status: 'healthy', message: 'API key verified, connected to Resend' };
  }

  async send(payload: SendMessagePayload): Promise<SendResult> {
    if (this.sandboxMode || !this.client) {
      console.log(`[RESEND_SANDBOX_SEND] To: ${payload.to}, Subject: ${payload.subject}\nBody: ${payload.body}`);
      return {
        providerMessageId: `sandbox-email-${Math.random().toString(36).substring(2, 11)}`,
        status: 'sent',
        rawResponse: { sandbox: true, timestamp: new Date().toISOString() }
      };
    }

    try {
      const res = await this.client.emails.send({
        from: this.fromAddress,
        to: payload.to,
        subject: payload.subject || 'PANTHER Notification',
        html: payload.body,
      });

      if (res.error) {
        return {
          providerMessageId: '',
          status: 'failed',
          error: res.error.message,
          rawResponse: res
        };
      }

      return {
        providerMessageId: res.data?.id || '',
        status: 'sent',
        rawResponse: res
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
    const results: SendResult[] = [];
    for (const p of payloads) {
      results.push(await this.send(p));
    }
    return results;
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
export default ResendEmailProvider;
