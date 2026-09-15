import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { EnvConfig } from '../../config/configuration';
import type { AuthUser, JwtPayload } from '../../common/types/auth-user';
import { UsersService } from '../../users/users.service';

function cookieExtractor(req: Request): string | null {
  const name = process.env.JWT_COOKIE_NAME || 'ovip_crm_token';
  if (req?.cookies && typeof req.cookies[name] === 'string') {
    return req.cookies[name];
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<AuthUser> {
    const headerSwitch = req.header('x-institution-id');
    const querySwitch =
      typeof req.query.institutionId === 'string'
        ? req.query.institutionId
        : undefined;
    const preferred = headerSwitch || querySwitch || payload.institutionId;

    const user = await this.usersService.findByIdForAuth(payload.sub, preferred);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User inactive or not found');
    }
    return user;
  }
}
