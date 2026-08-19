import { getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import type { Model } from 'mongoose';

import { AppModule } from '../app.module';
import {
  AppControlRule,
  type AppControlRuleDocument,
} from '../app-control/schemas/app-control-rule.schema';
import { removeLegacyAppControlRuleFields } from './app-control-rule.migration';

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const ruleModel = app.get<Model<AppControlRuleDocument>>(
      getModelToken(AppControlRule.name),
    );
    const modifiedCount = await removeLegacyAppControlRuleFields(ruleModel);
    console.log(`Migrated ${modifiedCount} legacy App Control rule(s).`);
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  console.error(
    'App Control rule migration failed:',
    error instanceof Error ? error.message : 'Unknown error',
  );
  process.exitCode = 1;
});
