import { Router } from 'express';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import {
  type EmailVerificationResult,
  sendVerificationEmail,
  verificationTokenFormat,
  verifyEmailToken,
} from '@/services/email-verification';

export const emailVerificationRouter = Router();

const resultPages: Record<
  EmailVerificationResult,
  { status: number; title: string; message: string }
> = {
  VERIFIED: {
    status: 200,
    title: 'Adresse e-mail confirmée',
    message: 'Merci ! Vous pouvez retourner dans l’application Epolia.',
  },
  INVALID: {
    status: 400,
    title: 'Lien incorrect',
    message:
      'Ce lien n’est pas valide. Ouvrez le lien complet du dernier e-mail reçu, ou demandez un nouveau lien depuis l’application Epolia.',
  },
  EXPIRED: {
    status: 410,
    title: 'Lien expiré',
    message:
      'Ce lien n’est plus valable : il a dépassé 24 heures ou un lien plus récent a été envoyé. Demandez un nouveau lien depuis l’application Epolia.',
  },
  ALREADY_USED: {
    status: 409,
    title: 'Lien déjà utilisé',
    message:
      'Ce lien a déjà servi. Si votre adresse est confirmée, il n’y a rien d’autre à faire : retournez dans l’application Epolia.',
  },
};

function renderPage(title: string, content: string) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} – Epolia</title>
<style>
body { font-family: system-ui, sans-serif; margin: 0; padding: 32px 16px; color: #1f2937; }
main { max-width: 420px; margin: 0 auto; }
button, .button { display: inline-block; text-decoration: none; font: inherit; padding: 12px 20px; border: 0; border-radius: 8px; background: #1f2937; color: #fff; cursor: pointer; }
</style>
</head>
<body><main>${content}</main></body>
</html>`;
}

// Opens the mobile app when APP_RETURN_URL is set (e.g. epolia://email-verified).
// The app must declare this address (Capacitor URL scheme) for the button to work.
function renderAppLink() {
  if (!config.appReturnUrl) {
    return '';
  }
  const href = config.appReturnUrl.replace(
    /[&"<>]/g,
    (character) => `&#${character.charCodeAt(0)};`,
  );
  return `<p><a class="button" href="${href}">Ouvrir l’application Epolia</a></p>`;
}

function renderResult(result: EmailVerificationResult) {
  const page = resultPages[result];
  return {
    status: page.status,
    html: renderPage(
      page.title,
      `<h1>${page.title}</h1><p>${page.message}</p>${renderAppLink()}`,
    ),
  };
}

// The e-mail link only shows a button. Mail scanners open links on their own:
// confirming on GET would consume the one-time link before the person clicks.
emailVerificationRouter.get('/auth/verify-email', (request, response) => {
  const token = request.query.token;
  // The page contains the one-time token: no cache may keep it.
  response.set('Cache-Control', 'no-store');

  if (typeof token !== 'string' || !verificationTokenFormat.test(token)) {
    const { status, html } = renderResult('INVALID');
    response.status(status).type('html').send(html);
    return;
  }

  // The token matches verificationTokenFormat, so it is safe to put in the HTML as is.
  response
    .status(200)
    .type('html')
    .send(
      renderPage(
        'Confirmer votre adresse e-mail',
        `<h1>Confirmer votre adresse e-mail</h1>
<p>Cliquez sur le bouton pour confirmer l’adresse utilisée pour votre compte Epolia.</p>
<form method="post" action="${request.baseUrl}/auth/verify-email">
<input type="hidden" name="token" value="${token}">
<button type="submit">Confirmer mon adresse</button>
</form>`,
      ),
    );
});

emailVerificationRouter.post(
  '/auth/verify-email',
  async (request, response) => {
    const { status, html } = renderResult(
      await verifyEmailToken(request.body?.token),
    );
    response.set('Cache-Control', 'no-store');
    response.status(status).type('html').send(html);
  },
);

emailVerificationRouter.post(
  '/auth/email-verification',
  requireAuth,
  async (_request, response) => {
    const { id, email, emailVerified } = response.locals.authUser as AuthUser;

    if (emailVerified) {
      throw new AppError(
        409,
        'EMAIL_ALREADY_VERIFIED',
        'Email address is already verified',
      );
    }
    if (!email) {
      throw new AppError(400, 'EMAIL_REQUIRED', 'Account has no email address');
    }

    await sendVerificationEmail({ id, email });

    // Accepted by the sending service, not proof that the message arrived.
    response.status(202).json({ emailVerificationSent: true });
  },
);
