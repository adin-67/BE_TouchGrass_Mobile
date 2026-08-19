import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { AppControlRule } from '../src/app-control/schemas/app-control-rule.schema';
import { PersonalAllowlist } from '../src/app-control/schemas/personal-allowlist.schema';
import { TemporaryUnlockSession } from '../src/app-control/schemas/temporary-unlock-session.schema';
import { UsageSummary } from '../src/app-control/schemas/usage-summary.schema';
import { User, type UserDocument } from '../src/users/schemas/user.schema';
import { removeLegacyAppControlRuleFields } from '../src/migrations/app-control-rule.migration';

interface AuthResponse {
  accessToken: string;
  user: { id: string };
}

interface RuleResponse {
  id: string;
  packageName: string;
  appName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UnlockResponse {
  id: string;
  packageName: string;
  minutes: number;
  leafPointsSpent: number;
  remainingLeafPoints: number;
  startedAt: string;
  expiresAt: string;
  alreadyProcessed: boolean;
}

describe('App Control (e2e)', () => {
  jest.setTimeout(60_000);
  let app: INestApplication<App>;
  let userModel: Model<UserDocument>;
  let ruleModel: Model<AppControlRule>;
  let allowlistModel: Model<PersonalAllowlist>;
  let unlockModel: Model<TemporaryUnlockSession>;
  let usageModel: Model<UsageSummary>;
  let tokenA: string;
  let tokenB: string;
  let userAId: string;
  let userBId: string;
  let ruleAId: string;
  let ruleBId: string;
  let allowlistId: string;

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const emailA = `app-control-a-${suffix}@touchgrass.test`;
  const emailB = `app-control-b-${suffix}@touchgrass.test`;
  const packageA = `com.example.social${Date.now()}`;
  const packageB = `com.example.video${Date.now()}`;
  const legacyPackage = `com.example.legacy${Date.now()}`;

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
    ruleModel = moduleFixture.get(getModelToken(AppControlRule.name));
    allowlistModel = moduleFixture.get(getModelToken(PersonalAllowlist.name));
    unlockModel = moduleFixture.get(getModelToken(TemporaryUnlockSession.name));
    usageModel = moduleFixture.get(getModelToken(UsageSummary.name));

    const responseA = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'App Control A',
        email: emailA,
        password: 'Test12345!',
      })
      .expect(201);
    const authA = responseA.body as AuthResponse;
    tokenA = authA.accessToken;
    userAId = authA.user.id;

    const responseB = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        fullName: 'App Control B',
        email: emailB,
        password: 'Test12345!',
      })
      .expect(201);
    const authB = responseB.body as AuthResponse;
    tokenB = authB.accessToken;
    userBId = authB.user.id;
  });

  it('requires a valid JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/app-control/rules')
      .expect(401);
  });

  it('returns server-owned unlock options', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/app-control/unlock-options')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(response.body).toEqual({
      items: [
        { id: 'UNLOCK_5', minutes: 5, leafPointCost: 5 },
        { id: 'UNLOCK_15', minutes: 15, leafPointCost: 15 },
        { id: 'UNLOCK_30', minutes: 30, leafPointCost: 30 },
      ],
    });

    await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `client-price-${suffix}`)
      .send({
        packageName: packageA,
        optionId: 'UNLOCK_5',
        leafPointCost: 1,
        expiresAt: '2099-01-01T00:00:00.000Z',
      })
      .expect(400);
  });

  it('returns the backend-owned protected package catalog', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/app-control/protected-packages')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const body = response.body as { items: string[] };
    expect(body.items).toEqual(
      expect.arrayContaining(['com.touchgrassmobile', 'com.android.settings']),
    );
  });

  it('creates a rule without legacy schedule fields and rejects client pricing fields', async () => {
    const createdA = await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(thisRule(packageA))
      .expect(201);
    const body = createdA.body as RuleResponse;
    ruleAId = body.id;
    expect(body).toEqual({
      id: ruleAId,
      packageName: packageA,
      appName: 'Example App',
      enabled: true,
      createdAt: expect.any(String) as string,
      updatedAt: expect.any(String) as string,
    });

    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...thisRule(`${packageA}.legacy`), dailyLimitMinutes: 60 })
      .expect(400);

    const createdB = await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(thisRule(packageB))
      .expect(201);
    ruleBId = (createdB.body as RuleResponse).id;

    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(thisRule(packageA))
      .expect(409);
  });

  it('rejects protected packages for rules and unlocks', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(thisRule('com.android.settings'))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `protected-${suffix}`)
      .send({ packageName: 'com.android.settings', optionId: 'UNLOCK_5' })
      .expect(403);
  });

  it('only lets the owner read, toggle or delete a rule', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/app-control/rules/${ruleBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: false })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/app-control/rules/${ruleBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);

    const toggled = await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: false })
      .expect(200);
    expect((toggled.body as RuleResponse).enabled).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ appName: 'Client cannot rename rules' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true })
      .expect(200);
  });

  it('removes legacy schedule fields from existing rules', async () => {
    const inserted = await ruleModel.collection.insertOne({
      user: new Types.ObjectId(userAId),
      packageName: legacyPackage,
      appName: 'Legacy App',
      enabled: true,
      dailyLimitMinutes: 60,
      activeDays: [0, 1, 2],
      startTime: '08:00',
      endTime: '22:00',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await removeLegacyAppControlRuleFields(ruleModel);
    const migrated = await ruleModel.collection.findOne({
      _id: inserted.insertedId,
    });
    expect(migrated).not.toHaveProperty('dailyLimitMinutes');
    expect(migrated).not.toHaveProperty('activeDays');
    expect(migrated).not.toHaveProperty('startTime');
    expect(migrated).not.toHaveProperty('endTime');
  });

  it('keeps allowlist behavior compatible', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/app-control/allowlist')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ packageName: packageA, appName: 'Social', reason: 'Work' })
      .expect(201);
    allowlistId = (added.body as { id: string }).id;

    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/app-control/allowlist/${allowlistId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true })
      .expect(200);
  });

  it('buys unlock time with Leaf Points once for an idempotent request', async () => {
    await userModel
      .updateOne({ _id: userAId }, { $set: { leafPoints: 50 } })
      .exec();
    const first = await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `unlock-${suffix}`)
      .send({ packageName: packageA, optionId: 'UNLOCK_15' })
      .expect(201);
    const firstBody = first.body as UnlockResponse;
    expect(firstBody).toMatchObject({
      packageName: packageA,
      minutes: 15,
      leafPointsSpent: 15,
      remainingLeafPoints: 35,
      alreadyProcessed: false,
    });
    expect(new Date(firstBody.expiresAt).getTime()).toBeGreaterThan(
      new Date(firstBody.startedAt).getTime(),
    );

    const repeated = await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `unlock-${suffix}`)
      .send({ packageName: packageA, optionId: 'UNLOCK_15' })
      .expect(201);
    expect(repeated.body).toMatchObject({
      id: firstBody.id,
      remainingLeafPoints: 35,
      alreadyProcessed: true,
    });

    await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `unlock-${suffix}`)
      .send({ packageName: packageA, optionId: 'UNLOCK_5' })
      .expect(409);
    const user = await userModel.findById(userAId).lean().exec();
    expect(user?.leafPoints).toBe(35);
    expect(user?.unlockMinutesBalance).toBe(0);
  });

  it('rejects insufficient Leaf Points and another user package', async () => {
    await userModel
      .updateOne({ _id: userBId }, { $set: { leafPoints: 0 } })
      .exec();
    await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Idempotency-Key', `foreign-${suffix}`)
      .send({ packageName: packageA, optionId: 'UNLOCK_5' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('Idempotency-Key', `insufficient-${suffix}`)
      .send({ packageName: packageB, optionId: 'UNLOCK_5' })
      .expect(400);
    const user = await userModel.findById(userBId).lean().exec();
    expect(user?.leafPoints).toBe(0);
  });

  it('extends an active session from the existing server expiresAt', async () => {
    const previous = await unlockModel
      .findOne({ user: new Types.ObjectId(userAId), packageName: packageA })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();
    expect(previous).not.toBeNull();

    const response = await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `extension-${suffix}`)
      .send({ packageName: packageA, optionId: 'UNLOCK_5' })
      .expect(201);
    const body = response.body as UnlockResponse;
    expect(body.remainingLeafPoints).toBe(30);
    expect(new Date(body.expiresAt).getTime()).toBe(
      previous!.expiresAt.getTime() + 5 * 60_000,
    );

    const status = await request(app.getHttpServer())
      .get(`/api/v1/app-control/unlock/${packageA}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(status.body).toMatchObject({
      packageName: packageA,
      unlocked: true,
    });
  });

  it('serializes concurrent unlock purchases without losing paid time', async () => {
    const previous = await unlockModel
      .findOne({ user: new Types.ObjectId(userAId), packageName: packageA })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();
    expect(previous).not.toBeNull();

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/app-control/unlock')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', `concurrent-a-${suffix}`)
        .send({ packageName: packageA, optionId: 'UNLOCK_5' }),
      request(app.getHttpServer())
        .post('/api/v1/app-control/unlock')
        .set('Authorization', `Bearer ${tokenA}`)
        .set('Idempotency-Key', `concurrent-b-${suffix}`)
        .send({ packageName: packageA, optionId: 'UNLOCK_5' }),
    ]);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const latest = await unlockModel
      .findOne({ user: new Types.ObjectId(userAId), packageName: packageA })
      .sort({ expiresAt: -1 })
      .lean()
      .exec();
    expect(latest?.expiresAt.getTime()).toBe(
      previous!.expiresAt.getTime() + 10 * 60_000,
    );
    const user = await userModel.findById(userAId).lean().exec();
    expect(user?.leafPoints).toBe(20);
  });

  it('uses server time and returns unlocked=false after expiry', async () => {
    await unlockModel
      .updateMany(
        { user: new Types.ObjectId(userAId), packageName: packageA },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      )
      .exec();
    const response = await request(app.getHttpServer())
      .get(`/api/v1/app-control/unlock/${packageA}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(response.body).toEqual({
      packageName: packageA,
      unlocked: false,
      expiresAt: null,
      remainingSeconds: 0,
    });
  });

  it('keeps UsageStats synchronization working', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app-control/usage-summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        date: '2026-08-15',
        apps: [
          {
            packageName: packageA,
            totalTimeInForegroundMs: 600000,
            lastTimeUsed: '2026-08-15T08:00:00.000Z',
          },
        ],
      })
      .expect(201);
    const response = await request(app.getHttpServer())
      .get('/api/v1/app-control/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(response.body).toMatchObject({
      available: true,
      totalScreenTimeSeconds: 600,
    });
  });

  it('deletes only a rule owned by the current user', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });

  afterAll(async () => {
    if (!userModel || !app) return;
    const userIds = [new Types.ObjectId(userAId), new Types.ObjectId(userBId)];
    await Promise.all([
      ruleModel.deleteMany({ user: { $in: userIds } }).exec(),
      allowlistModel.deleteMany({ user: { $in: userIds } }).exec(),
      unlockModel.deleteMany({ user: { $in: userIds } }).exec(),
      usageModel.deleteMany({ user: { $in: userIds } }).exec(),
    ]);
    await userModel.deleteMany({ _id: { $in: userIds } }).exec();
    await app.close();
  });
});

function thisRule(packageName: string) {
  return { packageName, appName: 'Example App', enabled: true };
}
