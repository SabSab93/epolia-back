import { AccountStatus, AuthProvider, UserRole } from '@prisma/client';
import {
  createPrismaMock,
  firstCallArg,
  PrismaMock,
  SelectCall,
  userMock,
} from '@test/mocks/users/users-service.mock';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UsersService(prisma as unknown as PrismaService);
  });

  describe('createLocalUser', () => {
    it('creates a local user with roles', async () => {
      prisma.user.create.mockResolvedValue(userMock);

      const result = await service.createLocalUser({
        email: 'user@example.com',
        passwordHash: 'hashed-password',
        phone: '+33600000000',
        roles: [UserRole.ETUDIANT],
      });

      expect(result).toBe(userMock);
      const createCall = firstCallArg<{
        data: {
          email: string;
          phone: string;
          passwordHash: string;
          roles: { create: { role: UserRole }[] };
        };
        select: Record<string, unknown>;
      }>(prisma.user.create);

      expect(createCall).toMatchObject({
        data: {
          email: 'user@example.com',
          phone: '+33600000000',
          passwordHash: 'hashed-password',
          roles: {
            create: [{ role: UserRole.ETUDIANT }],
          },
        },
      });
      expect(createCall.select).not.toHaveProperty('passwordHash');
    });
  });

  describe('findByEmail', () => {
    it('finds a user by email without passwordHash', async () => {
      prisma.user.findUnique.mockResolvedValue(userMock);

      const result = await service.findByEmail('user@example.com');

      expect(result).toBe(userMock);
      const findCall = firstCallArg<{ where: { email: string } } & SelectCall>(
        prisma.user.findUnique,
      );

      expect(findCall.where).toEqual({ email: 'user@example.com' });
      expect(findCall.select).not.toHaveProperty('passwordHash');
    });
  });

  describe('findByEmailForAuth', () => {
    it('finds a user by email for auth with passwordHash', async () => {
      const userForAuth = { ...userMock, passwordHash: 'hashed-password' };
      prisma.user.findUnique.mockResolvedValue(userForAuth);

      const result = await service.findByEmailForAuth('user@example.com');

      expect(result).toBe(userForAuth);
      const findForAuthCall = firstCallArg<
        { where: { email: string } } & SelectCall
      >(prisma.user.findUnique);

      expect(findForAuthCall).toMatchObject({
        where: { email: 'user@example.com' },
      });
      expect(findForAuthCall.select.passwordHash).toBe(true);
    });
  });

  describe('findByAuthAccount', () => {
    it('finds a user by auth account', async () => {
      prisma.authAccount.findUnique.mockResolvedValue({ user: userMock });

      const result = await service.findByAuthAccount(
        AuthProvider.GOOGLE,
        'google-sub',
      );

      expect(result).toBe(userMock);
      const findByAuthAccountCall = firstCallArg<{
        where: {
          provider_providerAccountId: {
            provider: AuthProvider;
            providerAccountId: string;
          };
        };
        select: { user: { select: Record<string, unknown> } };
      }>(prisma.authAccount.findUnique);

      expect(findByAuthAccountCall).toMatchObject({
        where: {
          provider_providerAccountId: {
            provider: AuthProvider.GOOGLE,
            providerAccountId: 'google-sub',
          },
        },
        select: {
          user: {},
        },
      });
      expect(findByAuthAccountCall.select.user.select).not.toHaveProperty(
        'passwordHash',
      );
    });
  });

  describe('assignRole', () => {
    it('assigns a role', async () => {
      const roleAssignment = {
        userId: userMock.id,
        role: UserRole.PARTICULIER,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      prisma.userRoleAssignment.upsert.mockResolvedValue(roleAssignment);

      const result = await service.assignRole(
        userMock.id,
        UserRole.PARTICULIER,
      );

      expect(result).toBe(roleAssignment);
      const upsertCall = firstCallArg<{
        where: { userId_role: { userId: string; role: UserRole } };
        update: Record<string, never>;
        create: { userId: string; role: UserRole };
      }>(prisma.userRoleAssignment.upsert);

      expect(upsertCall).toEqual({
        where: {
          userId_role: {
            userId: userMock.id,
            role: UserRole.PARTICULIER,
          },
        },
        update: {},
        create: {
          userId: userMock.id,
          role: UserRole.PARTICULIER,
        },
      });
    });
  });

  describe('updateStatus', () => {
    it('updates the user status', async () => {
      const suspendedUser = { ...userMock, status: AccountStatus.SUSPENDED };
      prisma.user.update.mockResolvedValue(suspendedUser);

      const result = await service.updateStatus(
        userMock.id,
        AccountStatus.SUSPENDED,
      );

      expect(result).toBe(suspendedUser);
      const updateCall = firstCallArg<
        { where: { id: string }; data: { status: AccountStatus } } & SelectCall
      >(prisma.user.update);

      expect(updateCall.where).toEqual({ id: userMock.id });
      expect(updateCall.data).toEqual({ status: AccountStatus.SUSPENDED });
      expect(updateCall.select).not.toHaveProperty('passwordHash');
    });
  });

  describe('anonymizeUser', () => {
    it('anonymizes a user and deletes auth accounts', async () => {
      const deletedUser = {
        ...userMock,
        email: null,
        phone: null,
        status: AccountStatus.DELETED,
        deletedAt: new Date('2026-01-02T00:00:00.000Z'),
        anonymizedAt: new Date('2026-01-02T00:00:00.000Z'),
      };
      prisma.authAccount.deleteMany.mockResolvedValue({ count: 1 });
      prisma.user.update.mockResolvedValue(deletedUser);

      const result = await service.anonymizeUser(userMock.id);

      expect(result).toBe(deletedUser);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.authAccount.deleteMany).toHaveBeenCalledWith({
        where: { userId: userMock.id },
      });
      const updateCall = firstCallArg<{
        where: { id: string };
        data: {
          email: null;
          phone: null;
          passwordHash: null;
          status: AccountStatus;
          deletedAt: Date;
          anonymizedAt: Date;
        };
        select: Record<string, unknown>;
      }>(prisma.user.update);

      expect(updateCall.where).toEqual({ id: userMock.id });
      expect(updateCall.data.email).toBeNull();
      expect(updateCall.data.phone).toBeNull();
      expect(updateCall.data.passwordHash).toBeNull();
      expect(updateCall.data.status).toBe(AccountStatus.DELETED);
      expect(updateCall.data.deletedAt).toBeInstanceOf(Date);
      expect(updateCall.data.anonymizedAt).toBeInstanceOf(Date);
      expect(updateCall.data.deletedAt).toBe(updateCall.data.anonymizedAt);
      expect(updateCall.select).not.toHaveProperty('passwordHash');
    });
  });
});
