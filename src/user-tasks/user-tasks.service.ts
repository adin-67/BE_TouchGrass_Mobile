import {
  ConflictException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Types } from 'mongoose';
import type { Model } from 'mongoose';
import { ListUserTasksQueryDto } from './dto/list-user-tasks-query.dto';
import { UpdateUserTaskProgressDto } from './dto/update-user-task-progress.dto';
import { TaskFrequency } from '../tasks/schemas/task.schema';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { StartUserTaskDto } from './dto/start-user-task.dto';
import {
  UserTask,
  UserTaskStatus,
  type UserTaskDocument,
} from './schemas/user-task.schema';

@Injectable()
export class UserTasksService {
  constructor(
    @InjectModel(UserTask.name)
    private readonly userTaskModel: Model<UserTaskDocument>,

    private readonly tasksService: TasksService,

    private readonly usersService: UsersService,
  ) {}
  async findAllForUser(userId: string, query: ListUserTasksQueryDto) {
    const filter: {
      user: Types.ObjectId;
      status?: UserTaskStatus;
    } = {
      user: new Types.ObjectId(userId),
    };

    if (query.status) {
      filter.status = query.status;
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.userTaskModel
        .find(filter)
        .populate({
          path: 'task',
          select: [
            'code',
            'title',
            'description',
            'category',
            'verificationType',
            'frequency',
            'emoji',
            'difficulty',
            'rewardXp',
            'rewardLp',
            'unlockMinutes',
            'targetValue',
            'targetUnit',
            'estimatedMinutes',
            'instructions',
          ],
        })
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(query.limit)
        .lean()
        .exec(),

      this.userTaskModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findByIdForUser(userId: string, userTaskId: string) {
    if (!isValidObjectId(userTaskId)) {
      throw new BadRequestException('Invalid user task id');
    }

    const userTask = await this.userTaskModel
      .findOne({
        _id: userTaskId,
        user: new Types.ObjectId(userId),
      })
      .populate({
        path: 'task',
        select: [
          'code',
          'title',
          'description',
          'category',
          'verificationType',
          'verificationLabels',
          'frequency',
          'emoji',
          'difficulty',
          'rewardXp',
          'rewardLp',
          'unlockMinutes',
          'targetValue',
          'targetUnit',
          'estimatedMinutes',
          'instructions',
          'startTime',
          'endTime',
        ],
      })
      .lean()
      .exec();

    if (!userTask) {
      throw new NotFoundException('User task not found');
    }

    return userTask;
  }

  async updateProgress(
    userId: string,
    userTaskId: string,
    updateDto: UpdateUserTaskProgressDto,
  ) {
    if (!isValidObjectId(userTaskId)) {
      throw new BadRequestException('Invalid user task id');
    }

    const userObjectId = new Types.ObjectId(userId);

    const existingUserTask = await this.userTaskModel
      .findOne({
        _id: userTaskId,
        user: userObjectId,
      })
      .exec();

    if (!existingUserTask) {
      throw new NotFoundException('User task not found');
    }

    if (existingUserTask.status !== UserTaskStatus.IN_PROGRESS) {
      throw new ConflictException('Only an in-progress task can be updated');
    }

    const task = await this.tasksService.findById(
      existingUserTask.task.toString(),
    );

    const safeProgress = Math.min(updateDto.progress, task.targetValue);

    const updatedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
        },
        {
          $max: {
            progress: safeProgress,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!updatedUserTask) {
      throw new ConflictException(
        'Task status changed while updating progress',
      );
    }

    return updatedUserTask;
  }

  async completeTask(userId: string, userTaskId: string) {
    if (!isValidObjectId(userTaskId)) {
      throw new BadRequestException('Invalid user task id');
    }

    const userObjectId = new Types.ObjectId(userId);

    const currentUserTask = await this.userTaskModel
      .findOne({
        _id: userTaskId,
        user: userObjectId,
      })
      .exec();

    if (!currentUserTask) {
      throw new NotFoundException('User task not found');
    }

    const task = await this.tasksService.findById(
      currentUserTask.task.toString(),
    );

    const createResponse = (userTask: UserTaskDocument) => ({
      userTask: {
        id: userTask._id.toString(),
        status: userTask.status,
        progress: userTask.progress,
        completedAt: userTask.completedAt,
        rewardGranted: userTask.rewardGranted,
      },
      task: {
        id: task._id.toString(),
        title: task.title,
        emoji: task.emoji,
      },
      rewardPreview: {
        xp: task.rewardXp,
        leafPoints: task.rewardLp,
        unlockMinutes: task.unlockMinutes,
      },
    });

    if (currentUserTask.status === UserTaskStatus.COMPLETED) {
      return createResponse(currentUserTask);
    }

    if (currentUserTask.status !== UserTaskStatus.IN_PROGRESS) {
      throw new ConflictException('Only an in-progress task can be completed');
    }

    if (currentUserTask.progress < task.targetValue) {
      throw new BadRequestException('Task target has not been reached');
    }

    const completedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          progress: {
            $gte: task.targetValue,
          },
        },
        {
          $set: {
            status: UserTaskStatus.COMPLETED,
            completedAt: new Date(),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!completedUserTask) {
      throw new ConflictException('Task status changed while completing');
    }

    return createResponse(completedUserTask);
  }

  async claimReward(userId: string, userTaskId: string) {
    if (!isValidObjectId(userTaskId)) {
      throw new BadRequestException('Invalid user task id');
    }

    const userObjectId = new Types.ObjectId(userId);

    const userTask = await this.userTaskModel
      .findOne({
        _id: userTaskId,
        user: userObjectId,
      })
      .exec();

    if (!userTask) {
      throw new NotFoundException('User task not found');
    }

    if (userTask.status !== UserTaskStatus.COMPLETED) {
      throw new ConflictException(
        'Task must be completed before claiming reward',
      );
    }

    const task = await this.tasksService.findById(userTask.task.toString());

    let rewardedUser = null;
    let alreadyClaimed = userTask.rewardGranted;

    if (!userTask.rewardGranted) {
      rewardedUser = await this.usersService.grantTaskReward(
        userId,
        userTaskId,
        task.rewardXp,
        task.rewardLp,
        task.unlockMinutes,
      );

      if (!rewardedUser) {
        alreadyClaimed = true;
      }

      await this.userTaskModel
        .updateOne(
          {
            _id: userTaskId,
            user: userObjectId,
            rewardGranted: false,
          },
          {
            $set: {
              rewardGranted: true,
            },
          },
        )
        .exec();
    }

    const user = rewardedUser ?? (await this.usersService.findById(userId));

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      userTask: {
        id: userTask._id.toString(),
        status: userTask.status,
        rewardGranted: true,
      },
      reward: {
        xp: task.rewardXp,
        leafPoints: task.rewardLp,
        unlockMinutes: task.unlockMinutes,
      },
      profile: {
        xp: user.xp,
        level: user.level,
        leafPoints: user.leafPoints,
        unlockMinutesBalance: user.unlockMinutesBalance,
      },
      alreadyClaimed,
    };
  }

  async startTask(
    userId: string,
    startUserTaskDto: StartUserTaskDto,
  ): Promise<UserTaskDocument> {
    const task = await this.tasksService.findById(startUserTaskDto.taskId);

    const cycleKey = this.createCycleKey(task.frequency);

    const userTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          user: new Types.ObjectId(userId),
          task: task._id,
          cycleKey,
        },
        {
          $setOnInsert: {
            status: UserTaskStatus.IN_PROGRESS,
            progress: 0,
            startedAt: new Date(),
            completedAt: null,
            expiresAt: null,
            rewardGranted: false,
          },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
        },
      )
      .exec();

    if (!userTask) {
      throw new InternalServerErrorException('Could not start task');
    }

    return userTask;
  }

  private createCycleKey(frequency: TaskFrequency): string {
    const today = this.getVietnamDateKey();

    if (frequency === TaskFrequency.DAILY) {
      return `DAILY:${today}`;
    }

    if (frequency === TaskFrequency.WEEKLY) {
      const monday = this.getMondayDateKey(today);
      return `WEEKLY:${monday}`;
    }

    return 'ANYTIME';
  }

  private getVietnamDateKey(): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }

  private getMondayDateKey(dateKey: string): string {
    const [year, month, day] = dateKey.split('-').map(Number);

    const date = new Date(Date.UTC(year, month - 1, day));

    const daysSinceMonday = (date.getUTCDay() + 6) % 7;

    date.setUTCDate(date.getUTCDate() - daysSinceMonday);

    return date.toISOString().slice(0, 10);
  }
}
