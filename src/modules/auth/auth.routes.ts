import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import { Router } from 'express';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import { assertAdult, parseAdultBirthDate } from '@/modules/auth/age';
import { getAuthUser } from '@/modules/auth/auth-user';
import { requireAuthAllowUnverified } from '@/modules/auth/auth.middleware';
import { sendVerificationEmail } from '@/modules/auth/email/email-verification';
import { readNewCredentials } from '@/modules/auth/new-credentials';
import {
  dummyPasswordHash,
  hashPassword,
  verifyPassword,
} from '@/modules/auth/password';
import { createSession, sessionUserSelect } from '@/modules/auth/session';
import { activateUserRole } from '@/modules/auth/user-roles';
import { prisma } from '@/prisma/client';
import { emailRegex } from '@/validation/input-formats';
import { assertMaxLength, maxLength } from '@/validation/input-limits';

const authUserSelect = {
  ...sessionUserSelect,
  passwordHash: true,
  birthDate: true,
} satisfies Prisma.UserSelect;

const termsOfUseConsentType = 'TERMS_OF_USE';

export const authRouter = Router();

authRouter.post('/auth/register', async (request, response) => {
  const body = request.body || {};
  const { role, firstName, lastName } = body;
  const credentials = readNewCredentials(body.email, body.password);

  if (
    role !== undefined &&
    role !== UserRole.STUDENT &&
    role !== UserRole.CUSTOMER
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', 'role is invalid');
  }

  const birthDate = parseAdultBirthDate(body.birthDate);
  if (
    typeof firstName !== 'string' ||
    !firstName.trim() ||
    typeof lastName !== 'string' ||
    !lastName.trim()
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'firstName and lastName are required',
    );
  }
  assertMaxLength(firstName.trim(), 'firstName', maxLength.name);
  assertMaxLength(lastName.trim(), 'lastName', maxLength.name);

  const termsVersion = config.registrationTermsVersion;
  if (!termsVersion) {
    throw new AppError(
      503,
      'REGISTRATION_TERMS_UNAVAILABLE',
      'Registration terms are not available',
    );
  }
  if (body.termsAccepted !== true) {
    throw new AppError(
      400,
      'TERMS_ACCEPTANCE_REQUIRED',
      'Terms of use must be accepted',
    );
  }
  if (body.termsVersion !== termsVersion) {
    throw new AppError(
      400,
      'TERMS_VERSION_INVALID',
      'Terms of use version is invalid',
    );
  }

  const passwordHash = await hashPassword(credentials.password);
  const userRole =
    role === UserRole.STUDENT ? UserRole.STUDENT : UserRole.CUSTOMER;

  try {
    const user = await prisma.user.create({
      data: {
        email: credentials.email,
        passwordHash,
        birthDate,
        status: AccountStatus.ACTIVE,
        roles: {
          create: [{ role: userRole }],
        },
        profile: {
          create: { firstName: firstName.trim(), lastName: lastName.trim() },
        },
        consents: {
          create: {
            consentType: termsOfUseConsentType,
            consentVersion: termsVersion,
            granted: true,
          },
        },
      },
      select: authUserSelect,
    });

    response.status(201).json({
      ...createSession(user),
      emailVerificationSent: await trySendVerificationEmail(user),
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new AppError(409, 'EMAIL_ALREADY_USED', 'Email already used');
    }

    throw error;
  }
});

// The account exists even when the e-mail cannot be sent: the app then offers
// to send a new code instead of losing the registration.
async function trySendVerificationEmail(user: {
  id: string;
  email: string | null;
}) {
  if (!user.email) {
    return false;
  }
  try {
    await sendVerificationEmail({ id: user.id, email: user.email });
    return true;
  } catch (error) {
    // No e-mail address or code in the log, only the kind of failure.
    const reason =
      error instanceof AppError
        ? error.code
        : error instanceof Prisma.PrismaClientKnownRequestError
          ? `PRISMA_${error.code}`
          : error instanceof Error
            ? error.name
            : 'unknown';
    console.error(`Verification e-mail not sent at registration: ${reason}`);
    return false;
  }
}

authRouter.post('/auth/login', async (request, response) => {
  const body = request.body || {};
  const { email, password } = body;
  // Lengths first: the e-mail regex must never run on a huge input.
  assertMaxLength(email, 'email', maxLength.email);
  assertMaxLength(password, 'password', maxLength.password);

  if (
    typeof email !== 'string' ||
    !emailRegex.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length === 0
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and password are required',
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      email: email.trim().toLowerCase(),
    },
    select: authUserSelect,
  });

  const passwordMatches = await verifyPassword(
    password,
    user?.passwordHash ?? dummyPasswordHash,
  );

  if (!user?.passwordHash || !passwordMatches) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  if (user.status !== AccountStatus.ACTIVE) {
    throw new AppError(403, 'ACCOUNT_NOT_ACTIVE', 'Account is not active');
  }

  if (!user.roles.some(({ role }) => role === UserRole.ADMIN)) {
    assertAdult(user.birthDate);
  }
  response.status(200).json(createSession(user));
});

authRouter.get('/auth/me', requireAuthAllowUnverified, (_request, response) => {
  response.status(200).json(getAuthUser(response));
});

authRouter.get(
  '/auth/terms-acceptance',
  requireAuthAllowUnverified,
  async (_request, response) => {
    const { id: userId } = getAuthUser(response);
    const acceptance = await prisma.userConsent.findFirst({
      where: { userId, consentType: termsOfUseConsentType, granted: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { consentVersion: true, createdAt: true },
    });

    const proof = acceptance && {
      version: acceptance.consentVersion,
      acceptedAt: acceptance.createdAt,
    };
    response.status(200).json(proof);
  },
);

authRouter.post(
  '/auth/roles',
  requireAuthAllowUnverified,
  async (request, response) => {
    const role: unknown = request.body?.role;
    if (role !== UserRole.STUDENT && role !== UserRole.CUSTOMER) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'role must be STUDENT or CUSTOMER',
      );
    }

    const { id: userId } = getAuthUser(response);
    const user = await activateUserRole(userId, role);

    response.status(200).json(createSession(user));
  },
);
