import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface VerifiedGoogleIdentity {
  providerAccountId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    const audiences = [
      this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_WEB_CLIENT_ID'),
    ].filter((value): value is string => Boolean(value));
    if (!audiences.length) {
      throw new ServiceUnavailableException('Google Login is not configured');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (
        !payload?.sub ||
        !payload.email ||
        payload.email_verified !== true ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(
          payload.iss,
        )
      ) {
        throw new UnauthorizedException('Invalid Google identity token');
      }
      return {
        providerAccountId: payload.sub,
        email: payload.email.toLowerCase().trim(),
        fullName:
          (payload.name?.trim().length ?? 0) >= 3
            ? payload.name!.trim()
            : 'Google User',
        avatarUrl: payload.picture ?? null,
      };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid Google identity token');
    }
  }
}
