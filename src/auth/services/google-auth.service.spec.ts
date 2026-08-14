import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

import { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthService', () => {
  const configService = {
    get: (key: string) =>
      key === 'GOOGLE_ANDROID_CLIENT_ID' ? 'android-client-id' : undefined,
  } as ConfigService;

  it('accepts a verified Google identity from the official verifier', async () => {
    const service = new GoogleAuthService(configService);
    mockVerifier(service, {
      sub: 'google-subject',
      email: 'User@Example.com',
      email_verified: true,
      iss: 'https://accounts.google.com',
      name: 'Google User',
    });
    await expect(service.verify('valid-id-token')).resolves.toMatchObject({
      providerAccountId: 'google-subject',
      email: 'user@example.com',
    });
  });

  it('rejects an unverified email or invalid issuer', async () => {
    const service = new GoogleAuthService(configService);
    mockVerifier(service, {
      sub: 'google-subject',
      email: 'user@example.com',
      email_verified: false,
      iss: 'https://accounts.google.com',
    });
    await expect(service.verify('invalid-id-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function mockVerifier(
  service: GoogleAuthService,
  payload: Record<string, unknown>,
): void {
  const client = service as unknown as {
    client: {
      verifyIdToken: jest.Mock;
    };
  };
  client.client.verifyIdToken = jest.fn().mockResolvedValue({
    getPayload: () => payload,
  });
}
