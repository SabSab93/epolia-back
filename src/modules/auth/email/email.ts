import { Resend } from 'resend';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';

const sendTimeoutMs = 10_000;

type Email = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () =>
        reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Hands an e-mail to Resend. Success only means Resend accepted the message,
 * not that it reached the inbox. Logs only the error type: Resend messages can
 * contain the recipient address.
 */
export async function sendEmail(email: Email): Promise<void> {
  if (!config.resendApiKey || !config.emailFrom) {
    throw new AppError(
      503,
      'EMAIL_SERVICE_UNAVAILABLE',
      'E-mail sending is not configured',
    );
  }

  const resend = new Resend(config.resendApiKey);
  let failure: string | undefined;

  try {
    const { error } = await withTimeout(
      resend.emails.send({ from: config.emailFrom, ...email }),
      sendTimeoutMs,
    );
    failure = error ? error.name || 'resend_error' : undefined;
  } catch (error) {
    failure = error instanceof Error ? error.name : 'unknown';
  }

  if (failure) {
    console.error(`E-mail not sent by Resend: ${failure}`);
    throw new AppError(502, 'EMAIL_SEND_FAILED', 'E-mail could not be sent');
  }
}
