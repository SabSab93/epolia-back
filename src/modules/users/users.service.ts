import { Injectable } from '@nestjs/common';
import {
  AccountStatus,
  AuthProvider,
  Prisma,
  UserRole,
  UserRoleAssignment,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLocalUserDto } from './dto/create-local-user.dto';

const userSelect = {
  id: true,
  email: true,
  phone: true,
  status: true,
  emailVerifiedAt: true,
  deletionRequestedAt: true,
  deletedAt: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: true,
      createdAt: true,
    },
  },
} satisfies Prisma.UserSelect;

const userForAuthSelect = {
  ...userSelect,
  passwordHash: true,
} satisfies Prisma.UserSelect;

type UserResult = Prisma.UserGetPayload<{ select: typeof userSelect }>;
type UserForAuthResult = Prisma.UserGetPayload<{
  select: typeof userForAuthSelect;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findById(userId: string): Prisma.PrismaPromise<UserResult | null> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: userSelect,
    });
  }

  findByEmail(email: string): Prisma.PrismaPromise<UserResult | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: userSelect,
    });
  }

  findByEmailForAuth(
    email: string,
  ): Prisma.PrismaPromise<UserForAuthResult | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: userForAuthSelect,
    });
  }

  async findByAuthAccount(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<UserResult | null> {
    const authAccount = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      select: {
        user: {
          select: userSelect,
        },
      },
    });

    return authAccount?.user ?? null;
  }

  createLocalUser(data: CreateLocalUserDto): Prisma.PrismaPromise<UserResult> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        phone: data.phone,
        passwordHash: data.passwordHash,
        roles: data.roles?.length
          ? {
              create: data.roles.map((role) => ({ role })),
            }
          : undefined,
      },
      select: userSelect,
    });
  }

  assignRole(
    userId: string,
    role: UserRole,
  ): Prisma.PrismaPromise<UserRoleAssignment> {
    return this.prisma.userRoleAssignment.upsert({
      where: {
        userId_role: {
          userId,
          role,
        },
      },
      update: {},
      create: {
        userId,
        role,
      },
    });
  }

  removeRole(
    userId: string,
    role: UserRole,
  ): Prisma.PrismaPromise<Prisma.BatchPayload> {
    return this.prisma.userRoleAssignment.deleteMany({
      where: {
        userId,
        role,
      },
    });
  }

  updateStatus(
    userId: string,
    status: AccountStatus,
  ): Prisma.PrismaPromise<UserResult> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: userSelect,
    });
  }

  requestDeletion(userId: string): Prisma.PrismaPromise<UserResult> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: AccountStatus.PENDING_DELETION,
        deletionRequestedAt: new Date(),
      },
      select: userSelect,
    });
  }

  anonymizeUser(userId: string): Promise<UserResult> {
    const anonymizedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.authAccount.deleteMany({
        where: { userId },
      });

      return tx.user.update({
        where: { id: userId },
        data: {
          email: null,
          phone: null,
          passwordHash: null,
          status: AccountStatus.DELETED,
          deletedAt: anonymizedAt,
          anonymizedAt,
        },
        select: userSelect,
      });
    });
  }
}
