import { config } from '@/config/env';
import { sendEmail } from '@/services/email';

const send = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send } })),
}));

const email = {
  to: 'user@example.com',
  subject: 'Subject',
  text: 'Text',
  html: '<p>Text</p>',
};

describe('sendEmail', () => {
  beforeEach(() => {
    send.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.replaceProperty(config, 'resendApiKey', 're_test');
    jest.replaceProperty(config, 'emailFrom', 'Epolia <no-reply@example.com>');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('hands the e-mail to Resend with the configured sender', async () => {
    send.mockResolvedValue({ data: { id: 'email-id' }, error: null });

    await sendEmail(email);

    expect(send).toHaveBeenCalledWith({
      from: 'Epolia <no-reply@example.com>',
      ...email,
    });
  });

  it('says when sending is not configured', async () => {
    jest.replaceProperty(config, 'resendApiKey', undefined);

    await expect(sendEmail(email)).rejects.toMatchObject({
      status: 503,
      code: 'EMAIL_SERVICE_UNAVAILABLE',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an error returned by Resend',
      () =>
        send.mockResolvedValue({ data: null, error: { message: 'invalid' } }),
    ],
    ['a network failure', () => send.mockRejectedValue(new Error('network'))],
  ])('reports %s as a failed send', async (_label, setup) => {
    setup();

    await expect(sendEmail(email)).rejects.toMatchObject({
      status: 502,
      code: 'EMAIL_SEND_FAILED',
    });
  });

  it('gives up when Resend does not answer within 10 seconds', async () => {
    jest.useFakeTimers();
    send.mockReturnValue(new Promise(() => undefined));

    const result = expect(sendEmail(email)).rejects.toMatchObject({
      status: 502,
      code: 'EMAIL_SEND_FAILED',
    });
    await jest.advanceTimersByTimeAsync(10_000);
    await result;
  });

  it('logs the kind of failure without the recipient address', async () => {
    send.mockResolvedValue({
      data: null,
      error: {
        name: 'validation_error',
        message: 'You can only send testing emails to user@example.com',
      },
    });

    await expect(sendEmail(email)).rejects.toBeDefined();

    const logged = String(jest.mocked(console.error).mock.calls[0]?.[0]);
    expect(logged).toContain('validation_error');
    expect(logged).not.toContain('user@example.com');
  });
});
