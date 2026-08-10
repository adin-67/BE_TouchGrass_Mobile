import { Param, Controller, Get, UseGuards } from '@nestjs/common';
import { ApiParam, ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { type TaskDocument } from './schemas/task.schema';
import { TasksService } from './tasks.service';

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  async findAll(): Promise<TaskDocument[]> {
    const tasks = await this.tasksService.findAll();

    return tasks;
  }
  @Get(':id')
  @ApiParam({
    name: 'id',
    description: 'MongoDB ID of the task',
  })
  async findById(@Param('id') taskId: string): Promise<TaskDocument> {
    const task = await this.tasksService.findById(taskId);

    return task;
  }
}
