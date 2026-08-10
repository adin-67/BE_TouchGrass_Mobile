import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId } from 'mongoose';
import type { Model } from 'mongoose';
import { Task, type TaskDocument } from './schemas/task.schema';

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Task.name)
    private readonly taskModel: Model<TaskDocument>,
  ) {}
  async findAll(): Promise<TaskDocument[]> {
    const tasks = await this.taskModel
      .find({
        active: true,
      })
      .sort({ createdAt: 1 })
      .exec();
    return tasks;
  }
  async findById(taskId: string): Promise<TaskDocument> {
    if (!isValidObjectId(taskId)) {
      throw new BadRequestException('Invalid task id');
    }

    const task = await this.taskModel
      .findOne({
        _id: taskId,
        active: true,
      })
      .exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }
}
