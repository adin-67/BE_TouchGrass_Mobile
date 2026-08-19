import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersModule } from '../users/users.module';
import { AppControlController } from './app-control.controller';
import { AppControlService } from './app-control.service';
import {
  AppControlRule,
  AppControlRuleSchema,
} from './schemas/app-control-rule.schema';
import {
  PersonalAllowlist,
  PersonalAllowlistSchema,
} from './schemas/personal-allowlist.schema';
import {
  TemporaryUnlockSession,
  TemporaryUnlockSessionSchema,
} from './schemas/temporary-unlock-session.schema';
import {
  UsageSummary,
  UsageSummarySchema,
} from './schemas/usage-summary.schema';
import {
  AppControlLock,
  AppControlLockSchema,
} from './schemas/app-control-lock.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AppControlRule.name, schema: AppControlRuleSchema },
      { name: PersonalAllowlist.name, schema: PersonalAllowlistSchema },
      {
        name: TemporaryUnlockSession.name,
        schema: TemporaryUnlockSessionSchema,
      },
      { name: UsageSummary.name, schema: UsageSummarySchema },
      { name: AppControlLock.name, schema: AppControlLockSchema },
    ]),
    UsersModule,
  ],
  controllers: [AppControlController],
  providers: [AppControlService],
  exports: [AppControlService],
})
export class AppControlModule {}
