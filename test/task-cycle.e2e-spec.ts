import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import {
  Task,
  TaskCategory,
  TaskDifficulty,
  TaskFrequency,
  TaskTargetUnit,
  TaskVerificationType,
} from '../src/tasks/schemas/task.schema';
import {
  UserTask,
  UserTaskStatus,
  UserTaskVerificationStatus,
} from '../src/user-tasks/schemas/user-task.schema';
import { User, type UserDocument } from '../src/users/schemas/user.schema';

interface AuthResponse {
  accessToken: string;
  user: { id: string };
}

interface StartedTaskResponse {
  id: string;
  cycleKey: string;
}

describe('Task cycles and rewards (e2e)', () => {
  jest.setTimeout(60_000);
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let taskModel: Model<Task>;
  let userTaskModel: Model<UserTask>;
  let token: string;
  let userId: string;
  let dailyTaskId: string;
  let weeklyTaskId: string;

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const codeSuffix = suffix.replace(/[^a-z0-9]/gi, '').toUpperCase();
  const email = `cycle-${suffix}@touchgrass.test`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    taskModel = moduleFixture.get(getModelToken(Task.name));
    userTaskModel = moduleFixture.get(getModelToken(UserTask.name));

    const auth = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Cycle Test User',
        email,
        password: 'Test12345!',
      })
      .expect(201);
    const authBody = auth.body as AuthResponse;
    token = authBody.accessToken;
    userId = authBody.user.id;

    const daily = await taskModel.create(
      taskData(`DAILY_${codeSuffix}`, TaskFrequency.DAILY),
    );
    const weekly = await taskModel.create(
      taskData(`WEEKLY_${codeSuffix}`, TaskFrequency.WEEKLY),
    );
    dailyTaskId = daily._id.toString();
    weeklyTaskId = weekly._id.toString();

    await userTaskModel.create([
      {
        user: new Types.ObjectId(userId),
        task: daily._id,
        cycleKey: 'DAILY:2000-01-01',
        status: UserTaskStatus.COMPLETED,
        verificationStatus: UserTaskVerificationStatus.PASSED,
        completedAt: new Date('2000-01-01T00:00:00.000Z'),
        rewardGranted: true,
      },
      {
        user: new Types.ObjectId(userId),
        task: weekly._id,
        cycleKey: 'WEEKLY:2000-01-03',
        status: UserTaskStatus.COMPLETED,
        verificationStatus: UserTaskVerificationStatus.PASSED,
        completedAt: new Date('2000-01-03T00:00:00.000Z'),
        rewardGranted: true,
      },
    ]);
  });

  it('reuses a DAILY UserTask in one Vietnam day and allows a new cycle', async () => {
    const expectedCycle = `DAILY:${vietnamDateKey()}`;
    const first = await startTask(app, token, dailyTaskId);
    const repeated = await startTask(app, token, dailyTaskId);
    expect(first.cycleKey).toBe(expectedCycle);
    expect(repeated.id).toBe(first.id);
    expect(repeated.cycleKey).toBe(expectedCycle);
    expect(
      await userTaskModel.countDocuments({
        user: new Types.ObjectId(userId),
        task: new Types.ObjectId(dailyTaskId),
      }),
    ).toBe(2);
  });

  it('reuses a WEEKLY UserTask until the next Vietnam Monday', async () => {
    const expectedCycle = `WEEKLY:${mondayDateKey(vietnamDateKey())}`;
    const first = await startTask(app, token, weeklyTaskId);
    const repeated = await startTask(app, token, weeklyTaskId);
    expect(first.cycleKey).toBe(expectedCycle);
    expect(repeated.id).toBe(first.id);
    expect(repeated.cycleKey).toBe(expectedCycle);
    expect(
      await userTaskModel.countDocuments({
        user: new Types.ObjectId(userId),
        task: new Types.ObjectId(weeklyTaskId),
      }),
    ).toBe(2);
  });

  it('grants XP and Leaf Points once without adding unlockMinutesBalance', async () => {
    const current = await userTaskModel
      .findOne({
        user: new Types.ObjectId(userId),
        task: new Types.ObjectId(dailyTaskId),
        cycleKey: `DAILY:${vietnamDateKey()}`,
      })
      .exec();
    expect(current).not.toBeNull();
    await userTaskModel
      .updateOne(
        { _id: current!._id },
        {
          $set: {
            status: UserTaskStatus.COMPLETED,
            verificationStatus: UserTaskVerificationStatus.PASSED,
            completedAt: new Date(),
            rewardGranted: false,
          },
        },
      )
      .exec();

    const first = await request(app.getHttpServer())
      .post(`/api/v1/user-tasks/${current!._id.toString()}/claim-reward`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(first.body).toMatchObject({
      reward: { xp: 3, leafPoints: 7, unlockMinutes: 0 },
      profile: {
        xp: 3,
        leafPoints: 7,
        unlockMinutesBalance: 0,
      },
      alreadyClaimed: false,
    });

    const repeated = await request(app.getHttpServer())
      .post(`/api/v1/user-tasks/${current!._id.toString()}/claim-reward`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(repeated.body).toMatchObject({
      profile: { xp: 3, leafPoints: 7, unlockMinutesBalance: 0 },
      alreadyClaimed: true,
    });

    const user = await userModel.findById(userId).lean().exec();
    expect(user?.xp).toBe(3);
    expect(user?.leafPoints).toBe(7);
    expect(user?.unlockMinutesBalance).toBe(0);
  });

  afterAll(async () => {
    if (!app || !userModel) return;
    const userObjectId = new Types.ObjectId(userId);
    await userTaskModel.deleteMany({ user: userObjectId }).exec();
    await taskModel
      .deleteMany({ _id: { $in: [dailyTaskId, weeklyTaskId] } })
      .exec();
    await userModel.deleteOne({ _id: userObjectId }).exec();
    await app.close();
  });
});

async function startTask(
  app: INestApplication<App>,
  token: string,
  taskId: string,
): Promise<StartedTaskResponse> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/user-tasks')
    .set('Authorization', `Bearer ${token}`)
    .send({ taskId })
    .expect(201);
  return response.body as StartedTaskResponse;
}

function taskData(code: string, frequency: TaskFrequency) {
  return {
    code,
    title: `${frequency} cycle task`,
    description: 'Task used to verify Vietnam cycle behavior',
    category: TaskCategory.WELLNESS,
    verificationType: TaskVerificationType.MANUAL_CHECKIN,
    frequency,
    emoji: 'T',
    difficulty: TaskDifficulty.EASY,
    rewardXp: 3,
    rewardLp: 7,
    unlockMinutes: 10,
    targetValue: 1,
    targetUnit: TaskTargetUnit.MINUTE,
    estimatedMinutes: 1,
    instructions: ['Complete cycle test task'],
    active: true,
  };
}

function vietnamDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function mondayDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
