import { CommunicationProvider, SendMessagePayload, SendResult } from '../types';

export class WhatsAppProvider implements CommunicationProvider {
  private phoneNumberId = '';
  private accessToken = '';
  private sandboxMode = true;

  async connect(config: any): Promise<void> {
    const phoneId = config.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = config.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;

    if (phoneId && token) {
      this.phoneNumberId = phoneId;
      this.accessToken = token;
      this.sandboxMode = false;
    } else {
      this.phoneNumberId = '';
      this.accessToken = '';
      this.sandboxMode = true;
      console.log('[WHATSAPP_PROVIDER] No WhatsApp Phone Number ID or Access Token. Running in Sandbox Mode.');
    }
  }

  async disconnect(): Promise<void> {
    this.phoneNumberId = '';
    this.accessToken = '';
    this.sandboxMode = true;
  }

  async health(): Promise<{ status: 'healthy' | 'error'; message?: string }> {
    if (this.sandboxMode) {
      return { status: 'healthy', message: 'Sandbox Mode active (Mocks to console)' };
    }
    return { status: 'healthy', message: `Meta Cloud API active. Phone ID: ${this.phoneNumberId}` };
  }

  async send(payload: SendMessagePayload): Promise<SendResult> {
    const cleanPhone = payload.to.replace(/[^\d]/g, ''); // strip non-numeric characters for Meta API format

    if (this.sandboxMode) {
      console.log(`[WHATSAPP_SANDBOX_SEND] Phone: +${cleanPhone}\nBody: ${payload.body}`);
      return {
        providerMessageId: `sandbox-wa-${Math.random().toString(36).substring(2, 11)}`,
        status: 'delivered', // sandbox is auto-delivered
        rawResponse: { sandbox: true, phone: cleanPhone, timestamp: new Date().toISOString() }
      };
    }

    try {
      const url = `https://graph.facebook.com/v20.0/${this.phoneNumberId}/messages`;
      
      // Determine if template message vs raw text
      // Meta WhatsApp Cloud API template format uses a JSON definition
      const isTemplate = payload.metadata?.templateName;
      let postBody: any = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
      };

      if (isTemplate && payload.metadata) {
        // Map template variables
        const parameters = Object.values(payload.variables || {}).map(val => ({
          type: 'text',
          text: String(val)
        }));

        postBody = {
          ...postBody,
          type: 'template',
          template: {
            name: payload.metadata.templateName,
            language: {
              code: payload.metadata.languageCode || 'en_US'
            },
            components: parameters.length > 0 ? [
              {
                type: 'body',
                parameters
              }
            ] : undefined
          }
        };
      } else {
        postBody = {
          ...postBody,
          type: 'text',
          text: {
            body: payload.body
          }
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postBody)
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          providerMessageId: '',
          status: 'failed',
          error: data.error?.message || 'Meta Cloud API send failed',
          rawResponse: data
        };
      }

      return {
        providerMessageId: data.messages?.[0]?.id || '',
        status: 'sent',
        rawResponse: data
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
export default WhatsAppProvider;
