import { AccountStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateUserStatusDto {
  @IsEnum(AccountStatus)
  status: AccountStatus;
}
