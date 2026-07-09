import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Payload del JWT validado, inyectado por JwtStrategy. */
export interface AuthUser {
  userId: string;
  email: string;
  roles: string[];
  patientProfileId?: string;
  doctorProfileId?: string;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
