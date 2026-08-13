import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { MongooseModule } from '@nestjs/mongoose';

import { Task, TaskSchema } from './schemas/task.schema';
import { AdminTasksController } from './admin-tasks.controller';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Task.name,
        schema: TaskSchema,
      },
    ]),
  ],
  providers: [TasksService, RolesGuard],
  controllers: [TasksController, AdminTasksController],
  exports: [TasksService],
})
export class TasksModule {}
