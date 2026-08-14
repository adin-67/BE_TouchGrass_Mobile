import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';

import { UsersService } from '../users/users.service';
import { TasksService } from '../tasks/tasks.service';
import {
  UserTask,
  type UserTaskDocument,
  UserTaskStatus,
} from '../user-tasks/schemas/user-task.schema';
import type { CreateAllowlistDto } from './dto/create-allowlist.dto';
import type { CreateAppControlRuleDto } from './dto/create-rule.dto';
import type { CreateTemporaryUnlockDto } from './dto/create-unlock.dto';
import type { UpdateAppControlRuleDto } from './dto/update-rule.dto';
import type { UpsertUsageSummaryDto } from './dto/usage-summary.dto';
import { isProtectedPackage } from './protected-packages';
import {
  AppControlRule,
  type AppControlRuleDocument,
} from './schemas/app-control-rule.schema';
import {
  PersonalAllowlist,
  type PersonalAllowlistDocument,
} from './schemas/personal-allowlist.schema';
import {
  TemporaryUnlockSession,
  type TemporaryUnlockSessionDocument,
  TemporaryUnlockStatus,
} from './schemas/temporary-unlock-session.schema';
import {
  UsageSummary,
  type UsageSummaryDocument,
} from './schemas/usage-summary.schema';

@Injectable()
export class AppControlService {
  constructor(
    @InjectModel(AppControlRule.name)
    private readonly ruleModel: Model<AppControlRuleDocument>,
    @InjectModel(PersonalAllowlist.name)
    private readonly allowlistModel: Model<PersonalAllowlistDocument>,
    @InjectModel(TemporaryUnlockSession.name)
    private readonly unlockModel: Model<TemporaryUnlockSessionDocument>,
    @InjectModel(UsageSummary.name)
    private readonly usageModel: Model<UsageSummaryDocument>,
    @InjectModel(UserTask.name)
    private readonly userTaskModel: Model<UserTaskDocument>,
    private readonly usersService: UsersService,
    private readonly tasksService: TasksService,
  ) {}

  async listRules(userId: string) {
    const user = this.userObjectId(userId);
    const rules = await this.ruleModel
      .find({ user })
      .sort({ appName: 1 })
      .exec();
    return { items: rules.map((rule) => this.ruleResponse(rule)) };
  }

  async getRule(userId: string, ruleId: string) {
    this.assertObjectId(ruleId, 'rule');
    const rule = await this.ruleModel
      .findOne({ _id: ruleId, user: this.userObjectId(userId) })
      .exec();
    if (!rule) throw new NotFoundException('App control rule not found');
    return this.ruleResponse(rule);
  }

  async createRule(userId: string, dto: CreateAppControlRuleDto) {
    const packageName = this.normalizePackage(dto.packageName);
    this.assertNotProtected(packageName);
    await this.assertNotAllowlisted(userId, packageName);

    try {
      const rule = await this.ruleModel.create({
        ...dto,
        user: new Types.ObjectId(userId),
        packageName,
        appName: dto.appName.trim(),
        activeDays: [...dto.activeDays].sort((a, b) => a - b),
      });
      return this.ruleResponse(rule);
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('A rule already exists for this package');
      }
      throw error;
    }
  }

  async updateRule(
    userId: string,
    ruleId: string,
    dto: UpdateAppControlRuleDto,
  ) {
    if (!Object.keys(dto).length) {
      throw new BadRequestException('At least one field must be provided');
    }
    const current = await this.ruleModel
      .findOne({
        _id: this.objectId(ruleId, 'rule'),
        user: this.userObjectId(userId),
      })
      .exec();
    if (!current) throw new NotFoundException('App control rule not found');
    if (dto.enabled === true) {
      this.assertNotProtected(current.packageName);
      await this.assertNotAllowlisted(userId, current.packageName);
    }

    const updated = await this.ruleModel
      .findOneAndUpdate(
        { _id: current._id, user: this.userObjectId(userId) },
        {
          $set: {
            ...dto,
            ...(dto.appName === undefined
              ? {}
              : { appName: dto.appName.trim() }),
            ...(dto.activeDays === undefined
              ? {}
              : { activeDays: [...dto.activeDays].sort((a, b) => a - b) }),
          },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('App control rule not found');
    return this.ruleResponse(updated);
  }

  async deleteRule(userId: string, ruleId: string) {
    const deleted = await this.ruleModel
      .findOneAndDelete({
        _id: this.objectId(ruleId, 'rule'),
        user: this.userObjectId(userId),
      })
      .exec();
    if (!deleted) throw new NotFoundException('App control rule not found');
    return { deleted: true, id: deleted._id.toString() };
  }

  async listAllowlist(userId: string) {
    const entries = await this.allowlistModel
      .find({ user: this.userObjectId(userId) })
      .sort({ appName: 1 })
      .exec();
    return { items: entries.map((entry) => this.allowlistResponse(entry)) };
  }

  async createAllowlist(userId: string, dto: CreateAllowlistDto) {
    const packageName = this.normalizePackage(dto.packageName);
    try {
      const entry = await this.allowlistModel.create({
        user: new Types.ObjectId(userId),
        packageName,
        appName: dto.appName.trim(),
        reason: dto.reason?.trim() || null,
      });
      await this.ruleModel
        .updateOne(
          { user: this.userObjectId(userId), packageName },
          { $set: { enabled: false } },
        )
        .exec();
      return this.allowlistResponse(entry);
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Package is already in your allowlist');
      }
      throw error;
    }
  }

  async deleteAllowlist(userId: string, entryId: string) {
    const deleted = await this.allowlistModel
      .findOneAndDelete({
        _id: this.objectId(entryId, 'allowlist entry'),
        user: this.userObjectId(userId),
      })
      .exec();
    if (!deleted) throw new NotFoundException('Allowlist entry not found');
    return { deleted: true, id: deleted._id.toString() };
  }

  async createUnlock(
    userId: string,
    dto: CreateTemporaryUnlockDto,
    operationKey: string | undefined,
  ) {
    const key = operationKey?.trim() ?? '';
    if (!key || key.length > 100) {
      throw new BadRequestException(
        'Idempotency-Key header must contain 1 to 100 characters',
      );
    }
    const packageName = this.normalizePackage(dto.packageName);
    this.assertNotProtected(packageName);
    await this.assertNotAllowlisted(userId, packageName);
    const rule = await this.ruleModel
      .findOne({ user: this.userObjectId(userId), packageName, enabled: true })
      .lean()
      .exec();
    if (!rule)
      throw new NotFoundException(
        'Enabled app control rule not found for this package',
      );

    const sourceUserTask = await this.userTaskModel
      .findOne({
        _id: this.objectId(dto.sourceUserTaskId, 'source user task'),
        user: this.userObjectId(userId),
      })
      .exec();
    if (!sourceUserTask) {
      throw new NotFoundException('Source user task not found');
    }
    if (
      sourceUserTask.status !== UserTaskStatus.COMPLETED ||
      !sourceUserTask.rewardGranted
    ) {
      throw new ConflictException(
        'Source user task must be completed and its reward must be claimed',
      );
    }
    const sourceTask = await this.tasksService.findByIdForAdmin(
      sourceUserTask.task.toString(),
    );
    if (dto.minutes > sourceTask.unlockMinutes) {
      throw new BadRequestException(
        `minutes cannot exceed the source task reward of ${sourceTask.unlockMinutes}`,
      );
    }

    let session = await this.unlockModel
      .findOne({ user: this.userObjectId(userId), operationKey: key })
      .select('+debited')
      .exec();
    if (session) {
      this.assertSameUnlock(
        session,
        packageName,
        dto.minutes,
        dto.sourceUserTaskId,
      );
      const balance = await this.ensureDebited(userId, session);
      return this.unlockResponse(session, balance, true);
    }

    const now = new Date();
    const currentActiveSession = await this.unlockModel
      .findOne({
        user: this.userObjectId(userId),
        packageName,
        status: TemporaryUnlockStatus.ACTIVE,
        expiresAt: { $gt: now },
        debited: true,
      })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();
    const extensionBase = currentActiveSession?.expiresAt ?? now;
    try {
      session = await this.unlockModel.create({
        user: new Types.ObjectId(userId),
        packageName,
        startedAt: now,
        expiresAt: new Date(extensionBase.getTime() + dto.minutes * 60_000),
        minutesSpent: dto.minutes,
        sourceUserTask: sourceUserTask._id,
        status: TemporaryUnlockStatus.ACTIVE,
        operationKey: key,
        debited: false,
      });
    } catch (error: unknown) {
      if (!this.isDuplicateKeyError(error)) throw error;
      session = await this.unlockModel
        .findOne({ user: this.userObjectId(userId), operationKey: key })
        .select('+debited')
        .exec();
      if (!session) {
        throw new ConflictException(
          'This source user task has already been used for temporary unlock',
        );
      }
      this.assertSameUnlock(
        session,
        packageName,
        dto.minutes,
        dto.sourceUserTaskId,
      );
    }

    const balance = await this.ensureDebited(userId, session);
    return this.unlockResponse(session, balance, false);
  }

  async getUnlockStatus(userId: string, rawPackageName: string) {
    const packageName = this.normalizePackage(rawPackageName);
    const now = new Date();
    await this.unlockModel
      .updateMany(
        {
          user: this.userObjectId(userId),
          packageName,
          status: TemporaryUnlockStatus.ACTIVE,
          expiresAt: { $lte: now },
        },
        { $set: { status: TemporaryUnlockStatus.EXPIRED } },
      )
      .exec();
    const session = await this.unlockModel
      .findOne({
        user: this.userObjectId(userId),
        packageName,
        status: TemporaryUnlockStatus.ACTIVE,
        expiresAt: { $gt: now },
        debited: true,
      })
      .sort({ expiresAt: -1 })
      .exec();
    if (!session)
      return {
        packageName,
        active: false,
        expiresAt: null,
        remainingSeconds: 0,
      };
    return {
      packageName,
      active: true,
      expiresAt: session.expiresAt,
      remainingSeconds: Math.max(
        0,
        Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  async upsertUsageSummary(userId: string, dto: UpsertUsageSummaryDto) {
    const date = new Date(`${dto.date}T00:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dto.date
    ) {
      throw new BadRequestException(
        'date must be a real calendar date in YYYY-MM-DD format',
      );
    }
    if (
      dto.apps.some(
        (app) =>
          app.foregroundSeconds === undefined &&
          app.totalTimeInForegroundMs === undefined,
      )
    ) {
      throw new BadRequestException(
        'Each app must include totalTimeInForegroundMs or foregroundSeconds',
      );
    }
    const normalizedApps = dto.apps.map((app) => {
      const totalTimeInForegroundMs =
        app.totalTimeInForegroundMs ?? (app.foregroundSeconds ?? 0) * 1000;
      return {
        packageName: this.normalizePackage(app.packageName),
        foregroundSeconds: Math.floor(totalTimeInForegroundMs / 1000),
        totalTimeInForegroundMs,
        lastTimeUsed: app.lastTimeUsed ? new Date(app.lastTimeUsed) : null,
      };
    });
    const foregroundTotal = normalizedApps.reduce(
      (sum, app) => sum + app.foregroundSeconds,
      0,
    );
    const totalScreenTimeSeconds =
      dto.totalScreenTimeSeconds ?? foregroundTotal;
    if (foregroundTotal > totalScreenTimeSeconds) {
      throw new BadRequestException(
        'Sum of app foregroundSeconds cannot exceed totalScreenTimeSeconds',
      );
    }
    const summary = await this.usageModel
      .findOneAndUpdate(
        { user: this.userObjectId(userId), date: dto.date },
        {
          $set: {
            totalScreenTimeSeconds,
            apps: normalizedApps,
          },
          $setOnInsert: { user: new Types.ObjectId(userId), date: dto.date },
        },
        { upsert: true, returnDocument: 'after', runValidators: true },
      )
      .exec();
    return {
      date: summary.date,
      totalScreenTimeSeconds: summary.totalScreenTimeSeconds,
      apps: summary.apps.map((app) => ({
        packageName: app.packageName,
        foregroundSeconds: app.foregroundSeconds,
        totalTimeInForegroundMs: app.totalTimeInForegroundMs,
        lastTimeUsed: app.lastTimeUsed,
      })),
      updatedAt: summary.updatedAt,
    };
  }

  async getSummary(userId: string) {
    const [usage, limitedAppCount] = await Promise.all([
      this.usageModel
        .findOne({ user: this.userObjectId(userId) })
        .sort({ date: -1 })
        .lean()
        .exec(),
      this.ruleModel
        .countDocuments({ user: this.userObjectId(userId), enabled: true })
        .exec(),
    ]);
    if (!usage) {
      return {
        available: false,
        date: null,
        totalScreenTimeSeconds: null,
        limitedAppCount,
        timeSavedAvailable: false,
        timeSavedSeconds: null,
      };
    }
    return {
      available: true,
      date: usage.date,
      totalScreenTimeSeconds: usage.totalScreenTimeSeconds,
      limitedAppCount,
      timeSavedAvailable: false,
      timeSavedSeconds: null,
    };
  }

  async deleteAllData(userId: string) {
    const results = await Promise.all([
      this.ruleModel.deleteMany({ user: this.userObjectId(userId) }).exec(),
      this.allowlistModel
        .deleteMany({ user: this.userObjectId(userId) })
        .exec(),
      this.unlockModel.deleteMany({ user: this.userObjectId(userId) }).exec(),
      this.usageModel.deleteMany({ user: this.userObjectId(userId) }).exec(),
      this.usersService.clearUnlockOperations(userId),
    ]);
    return {
      deleted: true,
      rules: results[0].deletedCount,
      allowlistEntries: results[1].deletedCount,
      unlockSessions: results[2].deletedCount,
      usageSummaries: results[3].deletedCount,
    };
  }

  private async ensureDebited(
    userId: string,
    session: TemporaryUnlockSessionDocument,
  ) {
    if (!session.debited) {
      const user = await this.usersService.spendUnlockMinutes(
        userId,
        session.minutesSpent,
        session.operationKey,
      );
      if (!user) {
        const alreadyDebited = await this.usersService.hasUnlockOperation(
          userId,
          session.operationKey,
        );
        if (!alreadyDebited) {
          await this.unlockModel
            .deleteOne({ _id: session._id, debited: false })
            .exec();
          throw new BadRequestException('Insufficient unlock minutes balance');
        }
      }
      session.debited = true;
      await session.save();
      return (
        user?.unlockMinutesBalance ??
        (await this.usersService.findById(userId))?.unlockMinutesBalance ??
        0
      );
    }
    return (
      (await this.usersService.findById(userId))?.unlockMinutesBalance ?? 0
    );
  }

  private assertSameUnlock(
    session: TemporaryUnlockSessionDocument,
    packageName: string,
    minutes: number,
    sourceUserTaskId: string,
  ) {
    if (
      session.packageName !== packageName ||
      session.minutesSpent !== minutes ||
      session.sourceUserTask?.toString() !== sourceUserTaskId
    ) {
      throw new ConflictException(
        'Idempotency-Key was already used for a different unlock request',
      );
    }
  }

  private unlockResponse(
    session: TemporaryUnlockSessionDocument,
    remainingBalance: number,
    alreadyProcessed: boolean,
  ) {
    return {
      id: session._id.toString(),
      sessionId: session._id.toString(),
      packageName: session.packageName,
      minutes: session.minutesSpent,
      startsAt: session.startedAt,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
      minutesSpent: session.minutesSpent,
      status: session.status,
      active:
        session.status === TemporaryUnlockStatus.ACTIVE &&
        session.expiresAt.getTime() > Date.now(),
      remainingBalance,
      alreadyProcessed,
    };
  }

  private ruleResponse(rule: AppControlRuleDocument) {
    return {
      id: rule._id.toString(),
      packageName: rule.packageName,
      appName: rule.appName,
      enabled: rule.enabled,
      dailyLimitMinutes: rule.dailyLimitMinutes,
      activeDays: rule.activeDays,
      startTime: rule.startTime,
      endTime: rule.endTime,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private allowlistResponse(entry: PersonalAllowlistDocument) {
    return {
      id: entry._id.toString(),
      packageName: entry.packageName,
      appName: entry.appName,
      reason: entry.reason,
    };
  }

  private async assertNotAllowlisted(userId: string, packageName: string) {
    if (
      await this.allowlistModel.exists({
        user: this.userObjectId(userId),
        packageName,
      })
    ) {
      throw new ConflictException('Package is in your personal allowlist');
    }
  }

  private assertNotProtected(packageName: string) {
    if (isProtectedPackage(packageName)) {
      throw new ForbiddenException(
        'This system package is protected and cannot be limited',
      );
    }
  }

  private normalizePackage(packageName: string) {
    return packageName.toLowerCase().trim();
  }
  private assertObjectId(id: string, name: string) {
    if (!isValidObjectId(id))
      throw new BadRequestException(`Invalid ${name} id`);
  }
  private objectId(id: string, name: string) {
    this.assertObjectId(id, name);
    return new Types.ObjectId(id);
  }

  private userObjectId(userId: string) {
    return this.objectId(userId, 'user');
  }
  private isDuplicateKeyError(error: unknown): error is { code: number } {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 11000
    );
  }
}
