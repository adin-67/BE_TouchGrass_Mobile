import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { TasksModule } from './tasks/tasks.module';
import * as Joi from 'joi';

import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UserTasksModule } from './user-tasks/user-tasks.module';
import { AppControlModule } from './app-control/app-control.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().port().default(3000),

        MONGODB_URI: Joi.string()
          .pattern(/^mongodb(\+srv)?:\/\//)
          .required(),

        JWT_ACCESS_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().required(),

        PASSWORD_RESET_TTL_MINUTES: Joi.number()
          .integer()
          .min(10)
          .max(15)
          .default(15),
        PASSWORD_RESET_URL: Joi.string().uri().when('MAIL_HOST', {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        MAIL_HOST: Joi.string().optional(),
        MAIL_PORT: Joi.number().port().default(587),
        MAIL_SECURE: Joi.boolean().default(false),
        MAIL_USER: Joi.string().when('MAIL_HOST', {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        MAIL_PASSWORD: Joi.string().when('MAIL_HOST', {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),
        MAIL_FROM: Joi.string().when('MAIL_HOST', {
          is: Joi.exist(),
          then: Joi.required(),
          otherwise: Joi.optional(),
        }),

        GOOGLE_ANDROID_CLIENT_ID: Joi.string().allow('').optional(),
        GOOGLE_WEB_CLIENT_ID: Joi.string().allow('').optional(),
      }),

      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    HealthModule,
    UsersModule,
    AuthModule,
    TasksModule,
    UserTasksModule,
    AppControlModule,
  ],

  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
