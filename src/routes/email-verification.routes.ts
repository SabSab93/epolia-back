import { Router } from 'express';
import { AppError } from '@/errors/app-error';
import { type AuthUser, requireAuth } from '@/middlewares/auth.middleware';
import {
  sendVerificationEmail,
  verifyEmailCode,
} from '@/services/email-verification';

export const emailVerificationRouter = Router();

// Links e-mailed before the switch to codes (valid 24 hours) land here.
// Static page: nothing from the request is read or shown.
// Can be removed once no such link can still be valid.
const obsoleteLinkPage = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lien remplacé – Epolia</title>
</head>
<body style="font-family: system-ui, sans-serif; margin: 0; padding: 32px 16px">
<main style="max-width: 420px; margin: 0 auto">
<h1>Ce lien n’est plus utilisé</h1>
<p>Epolia confirme maintenant votre adresse avec un code à 6 chiffres. Ouvrez l’application Epolia et demandez un nouveau code.</p>
</main>
</body>
</html>`;

emailVerificationRouter.get('/auth/verify-email', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.status(410).type('html').send(obsoleteLinkPage);
});

// Both routes act on the address of the signed-in account only.
function unverifiedEmail(authUser: AuthUser) {
  if (authUser.emailVerified) {
    throw new AppError(
      409,
      'EMAIL_ALREADY_VERIFIED',
      'Email address is already verified',
    );
  }
  if (!authUser.email) {
    throw new AppError(400, 'EMAIL_REQUIRED', 'Account has no email address');
  }
  return authUser.email;
}

emailVerificationRouter.post(
  '/auth/email-verification',
  requireAuth,
  async (_request, response) => {
    const authUser = response.locals.authUser as AuthUser;
    const email = unverifiedEmail(authUser);

    await sendVerificationEmail({ id: authUser.id, email });

    // Accepted by the sending service, not proof that the message arrived.
    response.status(202).json({ emailVerificationSent: true });
  },
);

emailVerificationRouter.post(
  '/auth/email-verification/verify',
  requireAuth,
  async (request, response) => {
    const authUser = response.locals.authUser as AuthUser;
    const email = unverifiedEmail(authUser);

    await verifyEmailCode({ id: authUser.id, email }, request.body?.code);

    response.status(200).json({ emailVerified: true });
  },
);
