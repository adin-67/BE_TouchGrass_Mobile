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
import {
  TaskFrequency,
  TaskVerificationType,
} from '../tasks/schemas/task.schema';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import {
  FinishGpsTrackingDto,
  type GpsPointDto,
} from './dto/finish-gps-tracking.dto';
import { StartUserTaskDto } from './dto/start-user-task.dto';
import {
  UserTask,
  UserTaskStatus,
  UserTaskVerificationStatus,
  type UserTaskDocument,
} from './schemas/user-task.schema';

const MAX_ACCEPTABLE_GPS_ACCURACY_METERS = 50;
const MAX_WALKING_SPEED_KMH = 15;
const MAX_TRACKING_DURATION_SECONDS = 4 * 60 * 60;
const GPS_CLOCK_TOLERANCE_MS = 2 * 60 * 1000;

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

    if (task.verificationType === TaskVerificationType.GPS_DISTANCE) {
      throw new ConflictException(
        'GPS progress must be updated through GPS verification',
      );
    }

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

    if (
      task.verificationType === TaskVerificationType.GPS_DISTANCE &&
      currentUserTask.verificationStatus !== UserTaskVerificationStatus.PASSED
    ) {
      throw new ConflictException(
        'GPS task must pass verification before completion',
      );
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

  async startGpsTracking(userId: string, userTaskId: string) {
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

    if (currentUserTask.status !== UserTaskStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Only an in-progress task can start GPS tracking',
      );
    }

    const task = await this.tasksService.findById(
      currentUserTask.task.toString(),
    );

    if (task.verificationType !== TaskVerificationType.GPS_DISTANCE) {
      throw new BadRequestException('Task does not use GPS verification');
    }

    if (
      currentUserTask.verificationStatus === UserTaskVerificationStatus.PASSED
    ) {
      return this.createGpsResponse(currentUserTask, task.targetValue, true);
    }

    if (
      currentUserTask.verificationStatus ===
        UserTaskVerificationStatus.IN_PROGRESS &&
      currentUserTask.trackingStartedAt
    ) {
      return this.createGpsResponse(currentUserTask, task.targetValue, true);
    }

    const trackingStartedAt = new Date();
    const startedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          $or: [
            { verificationStatus: { $exists: false } },
            {
              verificationStatus: UserTaskVerificationStatus.NOT_STARTED,
            },
            { verificationStatus: UserTaskVerificationStatus.FAILED },
          ],
        },
        {
          $set: {
            verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
            trackingStartedAt,
            trackingEndedAt: null,
            verifiedAt: null,
            distanceMeters: 0,
            durationSeconds: 0,
            averageSpeedKmh: 0,
            gpsSampleCount: 0,
            verificationFailureReason: null,
          },
          $inc: {
            verificationAttempts: 1,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!startedUserTask) {
      const latestUserTask = await this.userTaskModel
        .findOne({
          _id: userTaskId,
          user: userObjectId,
        })
        .exec();

      if (
        latestUserTask?.verificationStatus ===
        UserTaskVerificationStatus.IN_PROGRESS
      ) {
        return this.createGpsResponse(latestUserTask, task.targetValue, true);
      }

      throw new ConflictException('Could not start GPS tracking');
    }

    return this.createGpsResponse(startedUserTask, task.targetValue, false);
  }

  async finishGpsTracking(
    userId: string,
    userTaskId: string,
    finishDto: FinishGpsTrackingDto,
  ) {
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

    if (task.verificationType !== TaskVerificationType.GPS_DISTANCE) {
      throw new BadRequestException('Task does not use GPS verification');
    }

    if (
      currentUserTask.verificationStatus === UserTaskVerificationStatus.PASSED
    ) {
      return this.createGpsResponse(currentUserTask, task.targetValue, true);
    }

    if (
      currentUserTask.status !== UserTaskStatus.IN_PROGRESS ||
      currentUserTask.verificationStatus !==
        UserTaskVerificationStatus.IN_PROGRESS ||
      !currentUserTask.trackingStartedAt
    ) {
      throw new ConflictException('GPS tracking has not been started');
    }

    const summary = this.calculateGpsSummary(
      finishDto.points,
      currentUserTask.trackingStartedAt,
    );
    const safeProgress = Math.min(summary.distanceMeters, task.targetValue);
    const passed =
      !summary.hasUnrealisticSpeed &&
      summary.distanceMeters >= task.targetValue;
    const failureReason = summary.hasUnrealisticSpeed
      ? 'UNREALISTIC_SPEED'
      : passed
        ? null
        : 'TARGET_NOT_REACHED';

    const finishedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
        },
        {
          $set: {
            verificationStatus: passed
              ? UserTaskVerificationStatus.PASSED
              : UserTaskVerificationStatus.FAILED,
            progress: summary.hasUnrealisticSpeed
              ? currentUserTask.progress
              : Math.max(currentUserTask.progress, safeProgress),
            verifiedAt: passed ? new Date() : null,
            trackingEndedAt: summary.endedAt,
            distanceMeters: summary.distanceMeters,
            durationSeconds: summary.durationSeconds,
            averageSpeedKmh: summary.averageSpeedKmh,
            gpsSampleCount: summary.sampleCount,
            verificationFailureReason: failureReason,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .exec();

    if (!finishedUserTask) {
      const latestUserTask = await this.userTaskModel
        .findOne({
          _id: userTaskId,
          user: userObjectId,
        })
        .exec();

      if (
        latestUserTask &&
        latestUserTask.verificationStatus !==
          UserTaskVerificationStatus.IN_PROGRESS
      ) {
        return this.createGpsResponse(latestUserTask, task.targetValue, true);
      }

      throw new ConflictException('GPS tracking state changed while finishing');
    }

    return this.createGpsResponse(finishedUserTask, task.targetValue, false);
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

  private createGpsResponse(
    userTask: UserTaskDocument,
    targetValue: number,
    alreadyProcessed: boolean,
  ) {
    return {
      userTaskId: userTask._id.toString(),
      verificationStatus: userTask.verificationStatus,
      passed: userTask.verificationStatus === UserTaskVerificationStatus.PASSED,
      progress: userTask.progress,
      targetValue,
      trackingStartedAt: userTask.trackingStartedAt,
      trackingEndedAt: userTask.trackingEndedAt,
      summary: {
        distanceMeters: userTask.distanceMeters,
        durationSeconds: userTask.durationSeconds,
        averageSpeedKmh: userTask.averageSpeedKmh,
        sampleCount: userTask.gpsSampleCount,
      },
      failureReason: userTask.verificationFailureReason,
      alreadyProcessed,
    };
  }

  private calculateGpsSummary(points: GpsPointDto[], trackingStartedAt: Date) {
    const accuratePoints = points.filter(
      (point) => point.accuracy <= MAX_ACCEPTABLE_GPS_ACCURACY_METERS,
    );

    if (accuratePoints.length < 2) {
      throw new BadRequestException(
        'At least two accurate GPS points are required',
      );
    }

    const timedPoints = accuratePoints.map((point) => ({
      ...point,
      time: new Date(point.timestamp).getTime(),
    }));

    for (let index = 1; index < timedPoints.length; index += 1) {
      if (timedPoints[index].time <= timedPoints[index - 1].time) {
        throw new BadRequestException(
          'GPS point timestamps must be strictly increasing',
        );
      }
    }

    const firstTime = timedPoints[0].time;
    const lastTime = timedPoints[timedPoints.length - 1].time;
    const now = Date.now();
    const serverTrackingDurationSeconds = Math.floor(
      (now - trackingStartedAt.getTime()) / 1000,
    );

    if (
      firstTime < trackingStartedAt.getTime() - GPS_CLOCK_TOLERANCE_MS ||
      lastTime > now + GPS_CLOCK_TOLERANCE_MS
    ) {
      throw new BadRequestException(
        'GPS point timestamps are outside the tracking session',
      );
    }

    const durationSeconds = Math.floor((lastTime - firstTime) / 1000);

    if (
      durationSeconds <= 0 ||
      durationSeconds > MAX_TRACKING_DURATION_SECONDS ||
      serverTrackingDurationSeconds > MAX_TRACKING_DURATION_SECONDS
    ) {
      throw new BadRequestException('Invalid GPS tracking duration');
    }

    let distanceMeters = 0;
    let hasUnrealisticSpeed = false;

    for (let index = 1; index < timedPoints.length; index += 1) {
      const previousPoint = timedPoints[index - 1];
      const currentPoint = timedPoints[index];
      const segmentDistance = this.calculateHaversineDistance(
        previousPoint.latitude,
        previousPoint.longitude,
        currentPoint.latitude,
        currentPoint.longitude,
      );
      const accuracyNoise = Math.max(
        previousPoint.accuracy,
        currentPoint.accuracy,
      );
      const minimumMovementMeters = Math.max(2, accuracyNoise * 0.15);

      if (segmentDistance <= minimumMovementMeters) {
        continue;
      }

      const segmentSeconds = (currentPoint.time - previousPoint.time) / 1000;
      const segmentSpeedKmh = (segmentDistance / segmentSeconds) * 3.6;

      if (segmentSpeedKmh > MAX_WALKING_SPEED_KMH) {
        hasUnrealisticSpeed = true;
      }

      distanceMeters += segmentDistance;
    }

    const roundedDistance = Math.round(distanceMeters * 100) / 100;
    const averageSpeedKmh =
      Math.round((roundedDistance / durationSeconds) * 3.6 * 100) / 100;

    return {
      distanceMeters: roundedDistance,
      durationSeconds,
      averageSpeedKmh,
      sampleCount: accuratePoints.length,
      hasUnrealisticSpeed,
      endedAt: new Date(lastTime),
    };
  }

  private calculateHaversineDistance(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const earthRadiusMeters = 6_371_000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = toRadians(latitude2 - latitude1);
    const longitudeDelta = toRadians(longitude2 - longitude1);
    const firstLatitude = toRadians(latitude1);
    const secondLatitude = toRadians(latitude2);
    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) *
        Math.cos(secondLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return (
      2 *
      earthRadiusMeters *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
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
