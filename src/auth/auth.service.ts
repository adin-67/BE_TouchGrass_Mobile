import {
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  PasswordResetToken,
  type PasswordResetTokenDocument,
} from './schemas/password-reset-token.schema';
import {
  PasswordResetRateLimit,
  type PasswordResetRateLimitDocument,
} from './schemas/password-reset-rate-limit.schema';
import { EmailService } from './services/email.service';
import { GoogleAuthService } from './services/google-auth.service';
import { AuthProvider, type UserDocument } from '../users/schemas/user.schema';

const FORGOT_PASSWORD_MESSAGE =
  'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.';
const RESET_WINDOW_MS = 15 * 60 * 1000;
const RESET_MAX_PER_EMAIL = 3;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectModel(PasswordResetToken.name)
    private readonly passwordResetTokenModel: Model<PasswordResetTokenDocument>,
    @InjectModel(PasswordResetRateLimit.name)
    private readonly passwordResetRateLimitModel: Model<PasswordResetRateLimitDocument>,
    private readonly emailService: EmailService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly configService: ConfigService,
  ) {}
  async register(registerDto: RegisterDto) {
    const email = registerDto.email;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    const passwordHash = await argon2.hash(registerDto.password, {
      type: argon2.argon2id,
    });
    const createdUser = await this.usersService.createUser({
      fullName: registerDto.fullName,
      email: registerDto.email,
      passwordHash: passwordHash,
    });

    return await this.createAuthResponse(createdUser);
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(
      loginDto.email,
    );
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordIsValid = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );
    if (!passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return await this.createAuthResponse(user);
  }

  async forgotPassword(rawEmail: string) {
    const email = rawEmail.toLowerCase().trim();
    await this.consumeEmailResetRateLimit(email);
    const user = await this.usersService.findByEmail(email);
    if (!user) return { message: FORGOT_PASSWORD_MESSAGE };

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const ttlMinutes =
      this.configService.get<number>('PASSWORD_RESET_TTL_MINUTES') ?? 15;
    const resetRecord = await this.passwordResetTokenModel.create({
      user: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      usedAt: null,
      resetVersion: user.passwordResetVersion ?? 0,
    });
    try {
      const sent = await this.emailService.sendPasswordReset(email, token);
      if (!sent) {
        await this.passwordResetTokenModel.deleteOne({ _id: resetRecord._id });
        this.logger.warn(
          'Password reset email was not sent because mail is not configured',
        );
      }
    } catch (error: unknown) {
      await this.passwordResetTokenModel.deleteOne({ _id: resetRecord._id });
      this.logger.error(
        'Password reset email delivery failed',
        error instanceof Error ? error.stack : undefined,
      );
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  async resetPassword(token: string, newPassword: string) {
    const now = new Date();
    const tokenRecord = await this.passwordResetTokenModel
      .findOne({
        tokenHash: this.hashToken(token),
        usedAt: null,
        expiresAt: { $gt: now },
      })
      .select('+tokenHash')
      .exec();
    if (!tokenRecord) {
      throw new BadRequestException('Reset token is invalid or expired');
    }
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });
    const passwordWasReset = await this.usersService.resetPasswordIfVersion(
      tokenRecord.user.toString(),
      tokenRecord.resetVersion,
      passwordHash,
    );
    if (!passwordWasReset) {
      throw new BadRequestException('Reset token is invalid or expired');
    }
    await this.passwordResetTokenModel
      .updateMany(
        { user: tokenRecord.user, usedAt: null },
        { $set: { usedAt: now } },
      )
      .exec();
    return { message: 'Mật khẩu đã được đặt lại thành công.' };
  }

  async googleLogin(idToken: string) {
    const identity = await this.googleAuthService.verify(idToken);
    let user = await this.usersService.findByProvider(
      AuthProvider.GOOGLE,
      identity.providerAccountId,
    );
    if (!user) {
      const emailUser = await this.usersService.findByEmail(identity.email);
      if (emailUser) {
        throw new ConflictException(
          'Email đã có tài khoản. Hãy đăng nhập bằng mật khẩu; hệ thống không tự động liên kết chỉ dựa trên email.',
        );
      }
      try {
        user = await this.usersService.createGoogleUser(identity);
      } catch (error: unknown) {
        user = await this.usersService.findByProvider(
          AuthProvider.GOOGLE,
          identity.providerAccountId,
        );
        if (!user) throw error;
      }
    }
    return await this.createAuthResponse(user);
  }

  private async consumeEmailResetRateLimit(email: string): Promise<void> {
    const emailHash = this.hashToken(email);
    const now = new Date();
    const windowCutoff = new Date(now.getTime() - RESET_WINDOW_MS);
    const shouldResetWindow = {
      $lte: [{ $ifNull: ['$windowStartedAt', new Date(0)] }, windowCutoff],
    };
    try {
      await this.passwordResetRateLimitModel
        .findOneAndUpdate(
          {
            emailHash,
            $or: [
              { windowStartedAt: { $lte: windowCutoff } },
              { windowStartedAt: { $exists: false } },
              { requestCount: { $lt: RESET_MAX_PER_EMAIL } },
            ],
          },
          [
            {
              $set: {
                windowStartedAt: {
                  $cond: [shouldResetWindow, now, '$windowStartedAt'],
                },
                requestCount: {
                  $cond: [
                    shouldResetWindow,
                    1,
                    { $add: [{ $ifNull: ['$requestCount', 0] }, 1] },
                  ],
                },
              },
            },
          ],
          { upsert: true, returnDocument: 'after', updatePipeline: true },
        )
        .exec();
    } catch (error: unknown) {
      if (!this.isDuplicateKeyError(error)) throw error;
      throw new HttpException(
        'Too many password reset requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }

  private hashToken(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async createAuthResponse(user: UserDocument) {
    const accessToken = await this.jwtService.signAsync({
      sub: user._id.toString(),
      role: user.role,
    });
    return {
      accessToken,
      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        dateOfBirth: user.dateOfBirth,
        goals: user.goals,
        xp: user.xp,
        level: user.level,
        leafPoints: user.leafPoints,
        unlockMinutesBalance: user.unlockMinutesBalance,
        role: user.role,
      },
    };
  }
}
