import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { UsersModule } from '../users/users.module';
import { TasksModule } from '../tasks/tasks.module';
import {
  UserTask,
  UserTaskSchema,
} from '../user-tasks/schemas/user-task.schema';
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
      { name: UserTask.name, schema: UserTaskSchema },
    ]),
    UsersModule,
    TasksModule,
  ],
  controllers: [AppControlController],
  providers: [AppControlService],
  exports: [AppControlService],
})
export class AppControlModule {}
