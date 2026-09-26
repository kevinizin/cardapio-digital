/**
 * Envio de e-mails transacionais. `BrevoMailer` usa a API HTTP do Brevo;
 * `FakeMailer` guarda as mensagens em memória (testes).
 */

export interface EmailMessage {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailConfig {
  apiKey: string;
  from: string;
  fromName: string;
  replyTo?: string;
  publicUrl: string;
}

export const DEFAULT_PUBLIC_URL = 'https://reservas-aromasdavivi.up.railway.app';
export const DEFAULT_FROM_NAME = 'Aromas da Vivi';

export type EmailSetup =
  | { enabled: true; config: EmailConfig }
  | { enabled: false; reason: string; publicUrl: string };

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/** Lê a configuração do ambiente. Sem `BREVO_API_KEY`, os e-mails ficam desligados. */
export function emailSetupFromEnv(env: Record<string, string | undefined>): EmailSetup {
  const publicUrl = trimSlash(env.PUBLIC_URL?.trim() || DEFAULT_PUBLIC_URL);
  const apiKey = env.BREVO_API_KEY?.trim();
  if (!apiKey) return { enabled: false, reason: 'BREVO_API_KEY não configurada', publicUrl };
  const from = env.EMAIL_FROM?.trim();
  if (!from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) {
    return { enabled: false, reason: 'EMAIL_FROM ausente ou inválido (obrigatório com BREVO_API_KEY)', publicUrl };
  }
  return {
    enabled: true,
    config: {
      apiKey,
      from,
      fromName: env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME,
      replyTo: env.EMAIL_REPLY_TO?.trim() || undefined,
      publicUrl,
    },
  };
}

export const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

export class BrevoMailer implements Mailer {
  private readonly config: EmailConfig;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: EmailConfig, options: { fetch?: typeof fetch; timeoutMs?: number } = {}) {
    this.config = config;
    this.fetchFn = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async send(message: EmailMessage): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const replyTo = message.replyTo ?? this.config.replyTo;
    try {
      const response = await this.fetchFn(BREVO_ENDPOINT, {
        method: 'POST',
        headers: { 'api-key': this.config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: this.config.from, name: this.config.fromName },
          to: [message.to.name ? { email: message.to.email, name: message.to.name } : { email: message.to.email }],
          subject: message.subject,
          htmlContent: message.html,
          textContent: message.text,
          ...(replyTo ? { replyTo: { email: replyTo } } : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).slice(0, 300);
        throw new Error(`Brevo HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
    } catch (error) {
      if (controller.signal.aborted) throw new Error(`Brevo não respondeu em ${this.timeoutMs / 1000} s`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  /** Falhas programadas: cada chamada consome um item (true = falha). */
  failures: boolean[] = [];

  async send(message: EmailMessage): Promise<void> {
    if (this.failures.shift()) throw new Error('falha simulada');
    this.sent.push(message);
  }
}
