export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** e.g. List-Unsubscribe / List-Unsubscribe-Post */
  headers?: Record<string, string>;
  tags?: string[];
}

export interface SmsMessage {
  to: string; // E.164
  body: string;
}

export interface SendResult {
  provider: string;
  providerMessageId: string;
}

export interface MessagingAdapter {
  readonly provider: string;
  sendEmail(msg: EmailMessage): Promise<SendResult>;
  sendSms(msg: SmsMessage): Promise<SendResult>;
}
