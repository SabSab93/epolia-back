import { AccountStatus, UserRole } from '@prisma/client';

export const userMock = {
  id: '0f2f2c96-8f55-4a42-86ad-b9d9981edb34',
  email: 'user@example.com',
  phone: '+33600000000',
  status: AccountStatus.ACTIVE,
  emailVerifiedAt: null,
  deletionRequestedAt: null,
  deletedAt: null,
  anonymizedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  roles: [
    {
      role: UserRole.ETUDIANT,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ],
};

export type PrismaMock = {
  user: {
    findUnique: SingleArgMock;
    create: SingleArgMock;
    update: SingleArgMock;
  };
  authAccount: {
    findUnique: SingleArgMock;
    deleteMany: SingleArgMock;
  };
  userRoleAssignment: {
    upsert: SingleArgMock;
    deleteMany: SingleArgMock;
  };
  $transaction: jest.MockedFunction<TransactionMock>;
};

export type SingleArgMock = jest.Mock<Promise<unknown>, [unknown]>;
export type SelectCall = { select: Record<string, unknown> };

type TransactionMock = <T>(
  callback: (tx: PrismaMock) => Promise<T>,
) => Promise<T>;

export function createPrismaMock(): PrismaMock {
  const prisma = {
    user: {
      findUnique: jest.fn<Promise<unknown>, [unknown]>(),
      create: jest.fn<Promise<unknown>, [unknown]>(),
      update: jest.fn<Promise<unknown>, [unknown]>(),
    },
    authAccount: {
      findUnique: jest.fn<Promise<unknown>, [unknown]>(),
      deleteMany: jest.fn<Promise<unknown>, [unknown]>(),
    },
    userRoleAssignment: {
      upsert: jest.fn<Promise<unknown>, [unknown]>(),
      deleteMany: jest.fn<Promise<unknown>, [unknown]>(),
    },
    $transaction: jest.fn(),
  } satisfies PrismaMock;

  const transaction: TransactionMock = async (callback) => callback(prisma);
  prisma.$transaction.mockImplementation(transaction);

  return prisma;
}

export function firstCallArg<T>(mock: SingleArgMock): T {
  const call = mock.mock.calls[0];

  if (!call) {
    throw new Error('Expected mock to have been called');
  }

  return call[0] as T;
}
