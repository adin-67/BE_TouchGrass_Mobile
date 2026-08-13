import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId } from 'mongoose';
import type { Model } from 'mongoose';
import { Task, type TaskDocument } from './schemas/task.schema';
import { TaskTargetUnit, TaskVerificationType } from './schemas/task.schema';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

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

  async findAllForAdmin(): Promise<TaskDocument[]> {
    return await this.taskModel.find().sort({ createdAt: 1 }).exec();
  }

  async findByIdForAdmin(taskId: string): Promise<TaskDocument> {
    this.assertValidTaskId(taskId);

    const task = await this.taskModel.findById(taskId).exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async create(data: CreateTaskDto): Promise<TaskDocument> {
    this.validateTaskConfiguration(data);

    try {
      return await this.taskModel.create({
        ...data,
        code: data.code.trim().toUpperCase(),
        title: data.title.trim(),
        description: data.description.trim(),
        verificationLabels: data.verificationLabels?.map((label) =>
          label.trim(),
        ),
        instructions: data.instructions.map((instruction) =>
          instruction.trim(),
        ),
      });
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Task code already exists');
      }

      throw error;
    }
  }

  async update(taskId: string, data: UpdateTaskDto): Promise<TaskDocument> {
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    const currentTask = await this.findByIdForAdmin(taskId);
    const nextTask = {
      ...currentTask.toObject(),
      ...data,
    };

    this.validateTaskConfiguration(nextTask);

    const normalizedData = {
      ...data,
      ...(data.title === undefined ? {} : { title: data.title.trim() }),
      ...(data.description === undefined
        ? {}
        : { description: data.description.trim() }),
      ...(data.verificationLabels === undefined
        ? {}
        : {
            verificationLabels: data.verificationLabels.map((label) =>
              label.trim(),
            ),
          }),
      ...(data.instructions === undefined
        ? {}
        : {
            instructions: data.instructions.map((instruction) =>
              instruction.trim(),
            ),
          }),
    };

    const updatedTask = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { $set: normalizedData },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updatedTask) {
      throw new NotFoundException('Task not found');
    }

    return updatedTask;
  }

  async deactivate(taskId: string): Promise<TaskDocument> {
    this.assertValidTaskId(taskId);

    const task = await this.taskModel
      .findByIdAndUpdate(
        taskId,
        { $set: { active: false } },
        { new: true, runValidators: true },
      )
      .exec();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  private assertValidTaskId(taskId: string): void {
    if (!isValidObjectId(taskId)) {
      throw new BadRequestException('Invalid task id');
    }
  }

  private validateTaskConfiguration(
    task: Pick<Task, 'verificationType' | 'targetUnit' | 'verificationLabels'>,
  ): void {
    const expectedUnits: Record<TaskVerificationType, TaskTargetUnit> = {
      [TaskVerificationType.GPS_DISTANCE]: TaskTargetUnit.METER,
      [TaskVerificationType.PHOTO_AI]: TaskTargetUnit.PHOTO,
      [TaskVerificationType.SCREEN_OFF_TIMER]: TaskTargetUnit.MINUTE,
      [TaskVerificationType.MANUAL_CHECKIN]: TaskTargetUnit.MINUTE,
    };

    if (task.targetUnit !== expectedUnits[task.verificationType]) {
      throw new BadRequestException(
        `Target unit must be ${expectedUnits[task.verificationType]} for ${task.verificationType}`,
      );
    }

    if (
      task.verificationType === TaskVerificationType.PHOTO_AI &&
      !task.verificationLabels?.length
    ) {
      throw new BadRequestException(
        'Photo AI task must have at least one verification label',
      );
    }
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
