import { UserRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class AssignUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
