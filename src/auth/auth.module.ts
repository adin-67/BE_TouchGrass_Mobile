import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { UsersModule } from '../users/users.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from './schemas/password-reset-token.schema';
import {
  PasswordResetRateLimit,
  PasswordResetRateLimitSchema,
} from './schemas/password-reset-rate-limit.schema';
import { EmailService } from './services/email.service';
import { GoogleAuthService } from './services/google-auth.service';

@Module({
  imports: [
    UsersModule,
    MongooseModule.forFeature([
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
      {
        name: PasswordResetRateLimit.name,
        schema: PasswordResetRateLimitSchema,
      },
    ]),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),

        signOptions: {
          expiresIn: configService.getOrThrow<'15m'>('JWT_ACCESS_EXPIRES_IN'),
        },
      }),
    }),
  ],
  providers: [AuthService, EmailService, GoogleAuthService],
  controllers: [AuthController],
})
export class AuthModule {}
