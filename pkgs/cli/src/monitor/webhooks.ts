import axios from 'axios';
import { createLogger } from '../logger';

const logger = createLogger('webhooks');

export interface WebhookPayload {
  type: 'low_dust' | 'request_spike';
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
}

const SENSITIVE_KEY_PATTERN = /seed|mnemonic|private|secret|key|authorization/i;
const HEX_KEY_PATTERN = /^[0-9a-fA-F]{65,}$/;

/**
 * Recursively redacts sensitive values from an object.
 * Redacts keys matching sensitive patterns and hex strings longer than 64 chars.
 */
export function redactSensitive(obj: unknown): unknown {
  if (typeof obj === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(obj)) {
      return '[REDACTED]';
    }
    if (HEX_KEY_PATTERN.test(obj)) {
      return '[REDACTED_HEX]';
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(redactSensitive);
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[REDACTED]';
      } else if (typeof value === 'string' && HEX_KEY_PATTERN.test(value)) {
        result[key] = '[REDACTED_HEX]';
      } else {
        result[key] = redactSensitive(value);
      }
    }
    return result;
  }
  return obj;
}

/**
 * Sends webhook alerts to configured Slack and Discord URLs.
 * Errors are logged but never thrown to avoid crashing the service.
 */
export async function sendWebhookAlert(payload: WebhookPayload): Promise<void> {
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  const discordUrl = process.env.DISCORD_WEBHOOK_URL;

  const redactedDetails = redactSensitive(payload.details);
  const alertMessage = `[DustRegen Alert] ${payload.type}: ${payload.message}`;

  const promises: Promise<void>[] = [];

  if (slackUrl) {
    promises.push(
      axios.post(slackUrl, { text: alertMessage }).then(() => {}).catch((err) => {
        logger.warn('Failed to send Slack webhook', { error: (err as Error).message });
      })
    );
  }

  if (discordUrl) {
    promises.push(
      axios.post(discordUrl, { content: alertMessage }).then(() => {}).catch((err) => {
        logger.warn('Failed to send Discord webhook', { error: (err as Error).message });
      })
    );
  }

  if (promises.length > 0) {
    await Promise.all(promises);
  }
}
