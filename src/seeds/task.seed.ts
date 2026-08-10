import { getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import type { Model } from 'mongoose';

import { AppModule } from '../app.module';
import { Task, type TaskDocument } from '../tasks/schemas/task.schema';
import { taskSeedData } from './task-seed.data';

async function seedTasks(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    const taskModel = app.get<Model<TaskDocument>>(getModelToken(Task.name));

    for (const task of taskSeedData) {
      await taskModel
        .updateOne(
          {
            code: task.code,
          },
          {
            $set: task,
          },
          {
            upsert: true,
          },
        )
        .exec();
    }

    console.log(`Seeded ${taskSeedData.length} tasks successfully.`);
  } finally {
    await app.close();
  }
}

seedTasks().catch((error: unknown) => {
  console.error('Task seed failed:', error);

  process.exitCode = 1;
});
