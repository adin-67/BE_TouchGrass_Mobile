import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TasksModule } from '../tasks/tasks.module';
import { UserTasksService } from './user-tasks.service';
import { UserTasksController } from './user-tasks.controller';
import { UserTask, UserTaskSchema } from './schemas/user-task.schema';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: UserTask.name,
        schema: UserTaskSchema,
      },
    ]),
    TasksModule,
    UsersModule,
  ],
  providers: [UserTasksService],
  controllers: [UserTasksController],
})
export class UserTasksModule {}
