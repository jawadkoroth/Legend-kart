export type ChannelType = 'email' | 'whatsapp' | 'push' | 'sms';

export type MessageStatus =
  | 'created'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'failed';

export interface SendMessagePayload {
  to: string;
  subject?: string;
  body: string;
  variables?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface SendResult {
  providerMessageId: string;
  status: MessageStatus;
  rawResponse?: any;
  error?: string;
}

export interface CommunicationProvider {
  connect(config: any): Promise<void>;
  disconnect(): Promise<void>;
  health(): Promise<{ status: 'healthy' | 'error'; message?: string }>;
  send(payload: SendMessagePayload): Promise<SendResult>;
  sendBulk(payloads: SendMessagePayload[]): Promise<SendResult[]>;
  validate(template: string, variables: Record<string, string>): Promise<boolean>;
  preview(template: string, variables: Record<string, string>): Promise<string>;
}
