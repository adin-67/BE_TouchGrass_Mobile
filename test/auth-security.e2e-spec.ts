import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PasswordResetRateLimit } from '../src/auth/schemas/password-reset-rate-limit.schema';
import { PasswordResetToken } from '../src/auth/schemas/password-reset-token.schema';
import { EmailService } from '../src/auth/services/email.service';
import { GoogleAuthService } from '../src/auth/services/google-auth.service';
import { User, type UserDocument } from '../src/users/schemas/user.schema';

const GENERIC_MESSAGE =
  'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.';

describe('Password reset security (e2e)', () => {
  jest.setTimeout(60_000);
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let tokenModel: Model<PasswordResetToken>;
  let rateModel: Model<PasswordResetRateLimit>;
  const deliveredTokens = new Map<string, string>();
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `reset-${suffix}@touchgrass.test`;
  const unknownEmail = `unknown-${suffix}@touchgrass.test`;
  const limitedEmail = `limited-${suffix}@touchgrass.test`;
  const googleEmail = `google-${suffix}@touchgrass.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EmailService)
      .useValue({
        sendPasswordReset: (targetEmail: string, token: string) => {
          deliveredTokens.set(targetEmail, token);
          return Promise.resolve(true);
        },
      })
      .overrideProvider(GoogleAuthService)
      .useValue({
        verify: (idToken: string) =>
          Promise.resolve(
            idToken.startsWith('p')
              ? {
                  providerAccountId: `google-password-conflict-${suffix}`,
                  email,
                  fullName: 'Password Conflict',
                  avatarUrl: null,
                }
              : {
                  providerAccountId: `google-user-${suffix}`,
                  email: googleEmail,
                  fullName: 'Google Test User',
                  avatarUrl: null,
                },
          ),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    userModel = moduleFixture.get(getModelToken(User.name));
    tokenModel = moduleFixture.get(getModelToken(PasswordResetToken.name));
    rateModel = moduleFixture.get(getModelToken(PasswordResetRateLimit.name));

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Password Reset User',
        email,
        password: 'OldPassword123',
      })
      .expect(201);
  });

  it('does not reveal whether an email exists', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: unknownEmail })
      .expect(200);
    const existing = await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: email.toUpperCase() })
      .expect(200);
    expect(unknown.body).toEqual({ message: GENERIC_MESSAGE });
    expect(existing.body).toEqual({ message: GENERIC_MESSAGE });
    expect(deliveredTokens.has(email)).toBe(true);
  });

  it('rejects an incorrect reset token', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(43), newPassword: 'NewPassword123' })
      .expect(400);
  });

  it('rejects an expired reset token', async () => {
    const user = await userModel.findOne({ email }).lean().exec();
    expect(user).not.toBeNull();
    const token = deliveredTokens.get(email);
    expect(token).toBeDefined();
    await tokenModel
      .updateOne(
        { user: user?._id, tokenHash: hashRaw(token ?? '') },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      )
      .exec();
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'NewPassword123' })
      .expect(400);
  });

  it('resets password once and rejects token reuse', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email })
      .expect(200);
    const token = deliveredTokens.get(email);
    expect(token).toBeDefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'NewPassword123' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'AnotherPassword123' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'NewPassword123' })
      .expect(200);
  });

  it('rate limits repeated requests for the same normalized email', async () => {
    for (let index = 0; index < 3; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: limitedEmail })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: limitedEmail.toUpperCase() })
      .expect(429);
  });

  it('creates Google user by provider sub and refuses email-only auto-linking', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ idToken: 'g'.repeat(100) })
      .expect(200);
    const second = await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ idToken: 'g'.repeat(100) })
      .expect(200);
    expect((second.body as { user: { id: string } }).user.id).toBe(
      (first.body as { user: { id: string } }).user.id,
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/google')
      .send({ idToken: 'p'.repeat(100) })
      .expect(409);
  });

  afterAll(async () => {
    if (!userModel || !app) return;
    const users = await userModel
      .find({
        email: { $in: [email, unknownEmail, limitedEmail, googleEmail] },
      })
      .select('_id')
      .lean()
      .exec();
    const userIds = users.map((user) => user._id);
    await tokenModel.deleteMany({ user: { $in: userIds } }).exec();
    await rateModel
      .deleteMany({
        emailHash: {
          $in: [email, unknownEmail, limitedEmail].map(hashEmail),
        },
      })
      .exec();
    await userModel.deleteMany({ _id: { $in: userIds } }).exec();
    await app.close();
  });
});

function hashEmail(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

function hashRaw(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
