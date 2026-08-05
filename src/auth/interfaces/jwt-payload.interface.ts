import type { UserRoles } from '../../users/schemas/user.schema';

export interface JwtPayload {
  sub: string;
  role: UserRoles;
}
