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

interface AuthResponse {
  accessToken: string;
  user: { id: string };
}

interface RuleResponse {
  id: string;
  packageName: string;
  enabled: boolean;
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
  let ruleAId: string;
  let ruleBId: string;

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const emailA = `app-control-a-${suffix}@touchgrass.test`;
  const emailB = `app-control-b-${suffix}@touchgrass.test`;
  const packageA = `com.example.social${Date.now()}`;
  const packageB = `com.example.video${Date.now()}`;

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
  });

  it('returns 401 for a missing or invalid JWT', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/app-control/rules')
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/app-control/rules')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  it('rejects protected packages', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(thisRule('com.android.settings'))
      .expect(403);
  });

  it('validates dailyLimitMinutes and activeDays', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...thisRule(packageA), dailyLimitMinutes: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ ...thisRule(packageA), activeDays: [0, 7] })
      .expect(400);
  });

  it('creates, updates and returns only the owner rule', async () => {
    const createdA = await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(thisRule(packageA))
      .expect(201);
    ruleAId = (createdA.body as RuleResponse).id;

    const createdB = await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenB}`)
      .send(thisRule(packageB))
      .expect(201);
    ruleBId = (createdB.body as RuleResponse).id;

    const directlyStoredRule = await ruleModel.findById(ruleAId).lean().exec();
    expect(directlyStoredRule?.user.toString()).toBe(userAId);
    const decodedToken = JSON.parse(
      Buffer.from(tokenA.split('.')[1], 'base64url').toString('utf8'),
    ) as { sub: string };
    expect(decodedToken.sub).toBe(userAId);
    const directOwnerRules = await ruleModel
      .find({ user: new Types.ObjectId(userAId) })
      .lean()
      .exec();
    expect(directOwnerRules).toHaveLength(1);
    const ownerList = await request(app.getHttpServer())
      .get('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect((ownerList.body as { items: RuleResponse[] }).items).toHaveLength(1);

    await request(app.getHttpServer())
      .get(`/api/v1/app-control/rules/${ruleBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleBId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ dailyLimitMinutes: 30 })
      .expect(404);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ dailyLimitMinutes: 30 })
      .expect(200);
    expect(
      (updated.body as { dailyLimitMinutes: number }).dailyLimitMinutes,
    ).toBe(30);
  });

  it('disables a rule added to allowlist and rejects re-enabling it', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app-control/allowlist')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ packageName: packageA, appName: 'Social', reason: 'Work' })
      .expect(201);

    const storedRule = await ruleModel.findById(ruleAId).lean().exec();
    expect(storedRule?.enabled).toBe(false);

    await request(app.getHttpServer())
      .patch(`/api/v1/app-control/rules/${ruleAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ enabled: true })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/app-control/rules')
      .set('Authorization', `Bearer ${tokenA}`)
      .send(thisRule(packageA))
      .expect(409);
  });

  it('spends unlock balance once for repeated idempotent requests', async () => {
    await allowlistModel
      .deleteMany({ user: new Types.ObjectId(userAId) })
      .exec();
    expect(
      await allowlistModel.countDocuments({
        user: new Types.ObjectId(userAId),
        packageName: packageA,
      }),
    ).toBe(0);
    await ruleModel
      .updateOne({ _id: ruleAId }, { $set: { enabled: true } })
      .exec();
    await userModel
      .updateOne({ _id: userAId }, { $set: { unlockMinutesBalance: 10 } })
      .exec();

    const first = await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `unlock-${suffix}`)
      .send({ packageName: packageA, minutes: 5 });
    expect(first.status).toBe(201);
    expect(
      (first.body as { remainingBalance: number; alreadyProcessed: boolean })
        .remainingBalance,
    ).toBe(5);

    const repeated = await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `unlock-${suffix}`)
      .send({ packageName: packageA, minutes: 5 })
      .expect(201);
    expect(
      (repeated.body as { remainingBalance: number; alreadyProcessed: boolean })
        .remainingBalance,
    ).toBe(5);
    expect(
      (repeated.body as { alreadyProcessed: boolean }).alreadyProcessed,
    ).toBe(true);

    const user = await userModel.findById(userAId).lean().exec();
    expect(user?.unlockMinutesBalance).toBe(5);
  });

  it('rejects unlock when balance is insufficient', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/app-control/unlock')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('Idempotency-Key', `insufficient-${suffix}`)
      .send({ packageName: packageA, minutes: 6 })
      .expect(400);
  });

  it('returns active=false after a session expires', async () => {
    await unlockModel
      .updateMany(
        { user: new Types.ObjectId(userAId) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      )
      .exec();
    const response = await request(app.getHttpServer())
      .get(`/api/v1/app-control/unlock/${packageA}/status`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect((response.body as { active: boolean }).active).toBe(false);
  });

  it('returns available=false until real usage data is synchronized', async () => {
    const empty = await request(app.getHttpServer())
      .get('/api/v1/app-control/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect((empty.body as { available: boolean }).available).toBe(false);

    await request(app.getHttpServer())
      .post('/api/v1/app-control/usage-summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        date: '2026-08-13',
        totalScreenTimeSeconds: 3600,
        apps: [{ packageName: packageA, foregroundSeconds: 600 }],
      })
      .expect(201);

    const available = await request(app.getHttpServer())
      .get('/api/v1/app-control/summary')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(
      (available.body as { available: boolean; totalScreenTimeSeconds: number })
        .available,
    ).toBe(true);
    expect(
      (available.body as { totalScreenTimeSeconds: number })
        .totalScreenTimeSeconds,
    ).toBe(3600);
  });

  it('deletes a rule owned by the current user', async () => {
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
    const users = await userModel
      .find({ email: { $in: [emailA, emailB] } })
      .select('_id')
      .lean()
      .exec();
    const userIds = users.map((user) => user._id);
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
  return {
    packageName,
    appName: 'Example App',
    enabled: true,
    dailyLimitMinutes: 60,
    activeDays: [0, 1, 2, 3, 4, 5, 6],
    startTime: '08:00',
    endTime: '22:00',
  };
}
