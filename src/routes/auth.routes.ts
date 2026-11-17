import { AccountStatus, Prisma, UserRole } from '@prisma/client';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Router } from 'express';
import { config } from '@/config/env';
import { AppError } from '@/errors/app-error';
import {
  type AuthUser,
  requireAuthAllowUnverified,
} from '@/middlewares/auth.middleware';
import { prisma } from '@/prisma/client';
import { assertAdult, parseAdultBirthDate } from '@/services/age';
import { emailRegex } from '@/services/email';
import { sendVerificationEmail } from '@/services/email-verification';
import { assertMaxLength, maxLength } from '@/services/input-limits';
import {
  dummyPasswordHash,
  hashPassword,
  minPasswordLength,
  verifyPassword,
} from '@/services/password';
import { activateUserRole } from '@/services/user-roles';

const termsOfUseConsentType = 'TERMS_OF_USE';

const authUserSelect = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  status: true,
  passwordHash: true,
  birthDate: true,
  roles: {
    select: {
      role: true,
    },
  },
} satisfies Prisma.UserSelect;

export const authRouter = Router();

function createToken(user: { id: string; roles: { role: UserRole }[] }) {
  return jwt.sign(
    {
      sub: user.id,
      roles: user.roles.map((role) => role.role),
    },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
    },
  );
}

function formatUser(user: {
  id: string;
  email: string | null;
  emailVerifiedAt: Date | null;
  status: AccountStatus;
  roles: { role: UserRole }[];
}) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: Boolean(user.emailVerifiedAt),
    status: user.status,
    roles: user.roles.map((role) => role.role),
  };
}

authRouter.post('/auth/register', async (request, response) => {
  const body = request.body || {};
  const { email, password, role, firstName, lastName } = body;
  // Lengths first: the e-mail regex must never run on a huge input.
  assertMaxLength(email, 'email', maxLength.email);
  assertMaxLength(password, 'password', maxLength.password);

  if (
    typeof email !== 'string' ||
    !emailRegex.test(email.trim()) ||
    typeof password !== 'string' ||
    password.length < minPasswordLength
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'email and password with at least 8 characters are required',
    );
  }

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

  const passwordHash = await hashPassword(password);
  const userRole =
    role === UserRole.STUDENT ? UserRole.STUDENT : UserRole.CUSTOMER;

  try {
    const user = await prisma.user.create({
      data: {
        email: email.trim().toLowerCase(),
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
      user: formatUser(user),
      accessToken: createToken(user),
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
  response.status(200).json({
    user: formatUser(user),
    accessToken: createToken(user),
  });
});

authRouter.get('/auth/me', requireAuthAllowUnverified, (_request, response) => {
  response.status(200).json(response.locals.authUser as AuthUser);
});

authRouter.get(
  '/auth/terms-acceptance',
  requireAuthAllowUnverified,
  async (_request, response) => {
    const { id: userId } = response.locals.authUser as AuthUser;
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

    const { id: userId } = response.locals.authUser as AuthUser;
    const user = await activateUserRole(userId, role);

    response.status(200).json({
      user: formatUser(user),
      accessToken: createToken(user),
    });
  },
);
