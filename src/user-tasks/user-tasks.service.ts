import {
  ConflictException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { isValidObjectId, Types } from 'mongoose';
import type { Model, PipelineStage } from 'mongoose';
import { ListUserTasksQueryDto } from './dto/list-user-tasks-query.dto';
import { HistoryFilter, type HistoryQueryDto } from './dto/history-query.dto';
import {
  StatisticsPeriod,
  type StatisticsQueryDto,
} from './dto/statistics-query.dto';
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
import { FinishScreenTimerDto } from './dto/finish-screen-timer.dto';
import { SubmitPhotoVerificationDto } from './dto/submit-photo-verification.dto';
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
const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_PHOTO_SIZE_BYTES = 1024;
const PHOTO_CAPTURE_MAX_AGE_MS = 5 * 60 * 1000;
const PHOTO_CLOCK_TOLERANCE_MS = 2 * 60 * 1000;
const MAX_SCREEN_TIMER_DURATION_SECONDS = 4 * 60 * 60;
const SCREEN_TIMER_CLOCK_TOLERANCE_MS = 2 * 60 * 1000;
const SCREEN_EVENT_REPORT_MAX_AGE_MS = 5 * 60 * 1000;
const SCREEN_DURATION_TOLERANCE_SECONDS = 10;
const MAX_MANUAL_CHECKIN_DURATION_SECONDS = 4 * 60 * 60;
const VIETNAM_UTC_OFFSET_HOURS = 7;

interface HistoryCountResult {
  _id: HistoryFilter;
  count: number;
}

interface HistoryItemResult {
  id: string;
  taskId: string;
  title: string;
  emoji: string;
  category: string;
  verificationType: TaskVerificationType;
  activityAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  durationSeconds: number;
  rewardXp: number;
  rewardLp: number;
  rewardGranted: boolean;
  status: HistoryFilter;
}

interface StatisticsRecord {
  activityAt: Date;
  status: UserTaskStatus;
  verificationStatus: UserTaskVerificationStatus;
  distanceMeters: number;
  gpsDurationSeconds: number;
  screenTimerDurationSeconds: number;
  manualCheckinDurationSeconds: number;
  rewardGranted: boolean;
  task: {
    verificationType: TaskVerificationType;
    rewardXp: number;
    rewardLp: number;
  };
}

interface PeriodRange {
  startAt: Date;
  endAt: Date;
  previousStartAt: Date;
  previousEndAt: Date;
}

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

  async getHistory(userId: string, query: HistoryQueryDto) {
    const userObjectId = new Types.ObjectId(userId);
    const terminalMatch = {
      user: userObjectId,
      $or: [
        { status: UserTaskStatus.COMPLETED },
        { status: UserTaskStatus.CANCELLED },
        { status: UserTaskStatus.EXPIRED },
        { verificationStatus: UserTaskVerificationStatus.FAILED },
      ],
    };
    const historyStatusExpression = {
      $switch: {
        branches: [
          {
            case: { $eq: ['$status', UserTaskStatus.COMPLETED] },
            then: HistoryFilter.DONE,
          },
          {
            case: { $eq: ['$status', UserTaskStatus.CANCELLED] },
            then: HistoryFilter.CANCELLED,
          },
        ],
        default: HistoryFilter.INVALID,
      },
    };
    const skip = (query.page - 1) * query.limit;
    const itemPipeline: PipelineStage[] = [
      { $match: terminalMatch },
      {
        $addFields: {
          historyStatus: historyStatusExpression,
          activityAt: { $ifNull: ['$completedAt', '$updatedAt'] },
        },
      },
    ];

    if (query.filter !== HistoryFilter.ALL) {
      itemPipeline.push({
        $match: { historyStatus: query.filter },
      });
    }

    itemPipeline.push(
      { $sort: { activityAt: -1 } },
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: query.limit },
            {
              $lookup: {
                from: 'tasks',
                localField: 'task',
                foreignField: '_id',
                as: 'taskDetails',
              },
            },
            { $unwind: '$taskDetails' },
            {
              $project: {
                _id: 0,
                id: { $toString: '$_id' },
                taskId: { $toString: '$task' },
                title: '$taskDetails.title',
                emoji: '$taskDetails.emoji',
                category: '$taskDetails.category',
                verificationType: '$taskDetails.verificationType',
                activityAt: 1,
                startedAt: 1,
                completedAt: 1,
                durationSeconds: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $eq: [
                            '$taskDetails.verificationType',
                            TaskVerificationType.GPS_DISTANCE,
                          ],
                        },
                        then: '$durationSeconds',
                      },
                      {
                        case: {
                          $eq: [
                            '$taskDetails.verificationType',
                            TaskVerificationType.SCREEN_OFF_TIMER,
                          ],
                        },
                        then: '$screenTimerDurationSeconds',
                      },
                      {
                        case: {
                          $eq: [
                            '$taskDetails.verificationType',
                            TaskVerificationType.MANUAL_CHECKIN,
                          ],
                        },
                        then: '$manualCheckinDurationSeconds',
                      },
                    ],
                    default: 0,
                  },
                },
                rewardXp: '$taskDetails.rewardXp',
                rewardLp: '$taskDetails.rewardLp',
                rewardGranted: 1,
                status: '$historyStatus',
              },
            },
          ],
          total: [{ $count: 'value' }],
        },
      },
    );

    const [historyResult, countRows] = await Promise.all([
      this.userTaskModel
        .aggregate<{
          items: HistoryItemResult[];
          total: Array<{ value: number }>;
        }>(itemPipeline)
        .exec(),
      this.userTaskModel
        .aggregate<HistoryCountResult>([
          { $match: terminalMatch },
          { $addFields: { historyStatus: historyStatusExpression } },
          { $group: { _id: '$historyStatus', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const result = historyResult[0] ?? { items: [], total: [] };
    const counts = {
      all: 0,
      done: 0,
      invalid: 0,
      cancelled: 0,
    };

    for (const row of countRows) {
      counts[row._id] = row.count;
      counts.all += row.count;
    }

    const total = result.total[0]?.value ?? 0;

    return {
      items: result.items,
      counts,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getStatistics(userId: string, query: StatisticsQueryDto) {
    const range = this.getStatisticsRange(query.period);
    const records = await this.getStatisticsRecords(
      new Types.ObjectId(userId),
      range.previousStartAt,
      range.endAt,
    );
    const currentRecords = records.filter(
      (record) => record.activityAt >= range.startAt,
    );
    const previousRecords = records.filter(
      (record) => record.activityAt < range.startAt,
    );
    const currentSummary = this.summarizeStatistics(currentRecords);
    const previousSummary = this.summarizeStatistics(previousRecords);

    return {
      period: query.period,
      range: {
        startAt: range.startAt,
        endAt: range.endAt,
      },
      summary: {
        ...currentSummary,
        comparison: {
          completedPercent: this.calculatePercentChange(
            currentSummary.completed,
            previousSummary.completed,
          ),
          outdoorPercent: this.calculatePercentChange(
            currentSummary.outdoorSeconds,
            previousSummary.outdoorSeconds,
          ),
        },
      },
      series: this.buildStatisticsSeries(
        currentRecords,
        query.period,
        range.startAt,
        range.endAt,
      ),
      deviceMetrics: {
        available: false,
        source: 'ANDROID_USAGE_STATS_REQUIRED',
        screenTimeSeconds: null,
        topApps: [],
      },
    };
  }

  async getProfileSummary(userId: string) {
    const userObjectId = new Types.ObjectId(userId);
    const [completedRecords, historyItems] = await Promise.all([
      this.getStatisticsRecords(userObjectId),
      this.userTaskModel
        .countDocuments({
          user: userObjectId,
          $or: [
            { status: UserTaskStatus.COMPLETED },
            { status: UserTaskStatus.CANCELLED },
            { status: UserTaskStatus.EXPIRED },
            { verificationStatus: UserTaskVerificationStatus.FAILED },
          ],
        })
        .exec(),
    ]);
    const completed = completedRecords.filter(
      (record) => record.status === UserTaskStatus.COMPLETED,
    );
    const totalDistanceMeters = completed.reduce(
      (total, record) => total + record.distanceMeters,
      0,
    );
    const totalOfflineSeconds = completed.reduce(
      (total, record) =>
        total +
        record.screenTimerDurationSeconds +
        record.manualCheckinDurationSeconds,
      0,
    );

    return {
      completedTasks: completed.length,
      historyItems,
      totalDistanceMeters: Math.round(totalDistanceMeters * 100) / 100,
      totalWalkingKilometers:
        Math.round((totalDistanceMeters / 1000) * 100) / 100,
      totalOfflineSeconds,
      totalOfflineHours: Math.round((totalOfflineSeconds / 3600) * 10) / 10,
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

    if (
      task.verificationType === TaskVerificationType.GPS_DISTANCE ||
      task.verificationType === TaskVerificationType.PHOTO_AI ||
      task.verificationType === TaskVerificationType.SCREEN_OFF_TIMER ||
      task.verificationType === TaskVerificationType.MANUAL_CHECKIN
    ) {
      throw new ConflictException(
        'Verified task progress cannot be updated manually',
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

    if (
      task.verificationType === TaskVerificationType.PHOTO_AI &&
      currentUserTask.verificationStatus !== UserTaskVerificationStatus.PASSED
    ) {
      throw new ConflictException(
        'Photo task must pass verification before completion',
      );
    }

    if (
      task.verificationType === TaskVerificationType.SCREEN_OFF_TIMER &&
      currentUserTask.verificationStatus !== UserTaskVerificationStatus.PASSED
    ) {
      throw new ConflictException(
        'Screen timer task must pass verification before completion',
      );
    }

    if (
      task.verificationType === TaskVerificationType.MANUAL_CHECKIN &&
      currentUserTask.verificationStatus !== UserTaskVerificationStatus.PASSED
    ) {
      throw new ConflictException(
        'Manual check-in task must pass verification before completion',
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

  async startScreenTimer(userId: string, userTaskId: string) {
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
        'Only an in-progress task can start a screen timer',
      );
    }

    const task = await this.tasksService.findById(
      currentUserTask.task.toString(),
    );

    if (task.verificationType !== TaskVerificationType.SCREEN_OFF_TIMER) {
      throw new BadRequestException(
        'Task does not use screen timer verification',
      );
    }

    if (
      currentUserTask.verificationStatus === UserTaskVerificationStatus.PASSED
    ) {
      return this.createScreenTimerResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - MAX_SCREEN_TIMER_DURATION_SECONDS * 1000,
    );

    if (
      currentUserTask.verificationStatus ===
        UserTaskVerificationStatus.IN_PROGRESS &&
      currentUserTask.screenTimerStartedAt &&
      currentUserTask.screenTimerStartedAt > staleBefore
    ) {
      return this.createScreenTimerResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    const startedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          $or: [
            { verificationStatus: { $exists: false } },
            { verificationStatus: UserTaskVerificationStatus.NOT_STARTED },
            { verificationStatus: UserTaskVerificationStatus.FAILED },
            {
              verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
              screenTimerStartedAt: null,
            },
            {
              verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
              screenTimerStartedAt: { $lte: staleBefore },
            },
          ],
        },
        {
          $set: {
            verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
            progress: 0,
            verifiedAt: null,
            screenTimerStartedAt: now,
            screenTimerEndedAt: null,
            screenOffAt: null,
            screenOnAt: null,
            screenTimerDurationSeconds: 0,
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
        return this.createScreenTimerResponse(
          latestUserTask,
          task.targetValue,
          true,
        );
      }

      throw new ConflictException('Could not start screen timer');
    }

    return this.createScreenTimerResponse(
      startedUserTask,
      task.targetValue,
      false,
    );
  }

  async finishScreenTimer(
    userId: string,
    userTaskId: string,
    finishDto: FinishScreenTimerDto,
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

    if (task.verificationType !== TaskVerificationType.SCREEN_OFF_TIMER) {
      throw new BadRequestException(
        'Task does not use screen timer verification',
      );
    }

    if (
      currentUserTask.verificationStatus === UserTaskVerificationStatus.PASSED
    ) {
      return this.createScreenTimerResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    const screenOffAt = new Date(finishDto.screenOffAt);
    const screenOnAt = new Date(finishDto.screenOnAt);

    if (
      currentUserTask.verificationStatus ===
        UserTaskVerificationStatus.FAILED &&
      currentUserTask.screenOffAt?.getTime() === screenOffAt.getTime() &&
      currentUserTask.screenOnAt?.getTime() === screenOnAt.getTime()
    ) {
      return this.createScreenTimerResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    if (
      currentUserTask.status !== UserTaskStatus.IN_PROGRESS ||
      currentUserTask.verificationStatus !==
        UserTaskVerificationStatus.IN_PROGRESS ||
      !currentUserTask.screenTimerStartedAt
    ) {
      throw new ConflictException('Screen timer has not been started');
    }

    const now = new Date();
    const timerStartedAt = currentUserTask.screenTimerStartedAt;
    const screenOffTime = screenOffAt.getTime();
    const screenOnTime = screenOnAt.getTime();
    const nowTime = now.getTime();
    const timerStartedTime = timerStartedAt.getTime();

    if (screenOnTime <= screenOffTime) {
      throw new BadRequestException(
        'Screen-on time must be after screen-off time',
      );
    }

    if (
      screenOffTime < timerStartedTime - SCREEN_TIMER_CLOCK_TOLERANCE_MS ||
      screenOnTime > nowTime + SCREEN_TIMER_CLOCK_TOLERANCE_MS
    ) {
      throw new BadRequestException(
        'Screen event timestamps are outside the timer session',
      );
    }

    if (nowTime - screenOnTime > SCREEN_EVENT_REPORT_MAX_AGE_MS) {
      throw new BadRequestException(
        'Screen-on event must be reported within 5 minutes',
      );
    }

    const durationSeconds = Math.floor((screenOnTime - screenOffTime) / 1000);
    const serverElapsedSeconds = Math.floor(
      (nowTime - timerStartedTime) / 1000,
    );

    if (
      durationSeconds <= 0 ||
      durationSeconds > MAX_SCREEN_TIMER_DURATION_SECONDS ||
      serverElapsedSeconds > MAX_SCREEN_TIMER_DURATION_SECONDS
    ) {
      throw new BadRequestException(
        'Screen timer duration must be between 1 second and 4 hours',
      );
    }

    if (
      durationSeconds >
      serverElapsedSeconds + SCREEN_DURATION_TOLERANCE_SECONDS
    ) {
      throw new BadRequestException(
        'Screen-off duration is longer than the server timer',
      );
    }

    const targetSeconds = task.targetValue * 60;
    const passed = durationSeconds >= targetSeconds;
    const progressMinutes = Math.min(
      Math.round((durationSeconds / 60) * 100) / 100,
      task.targetValue,
    );
    const finishedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
          screenTimerStartedAt: timerStartedAt,
        },
        {
          $set: {
            verificationStatus: passed
              ? UserTaskVerificationStatus.PASSED
              : UserTaskVerificationStatus.FAILED,
            progress: progressMinutes,
            verifiedAt: passed ? now : null,
            screenTimerEndedAt: now,
            screenOffAt,
            screenOnAt,
            screenTimerDurationSeconds: durationSeconds,
            verificationFailureReason: passed ? null : 'TARGET_NOT_REACHED',
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
        return this.createScreenTimerResponse(
          latestUserTask,
          task.targetValue,
          true,
        );
      }

      throw new ConflictException('Screen timer state changed while finishing');
    }

    return this.createScreenTimerResponse(
      finishedUserTask,
      task.targetValue,
      false,
    );
  }

  async startManualCheckin(userId: string, userTaskId: string) {
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
        'Only an in-progress task can start a manual check-in',
      );
    }

    const task = await this.tasksService.findById(
      currentUserTask.task.toString(),
    );

    if (task.verificationType !== TaskVerificationType.MANUAL_CHECKIN) {
      throw new BadRequestException(
        'Task does not use manual check-in verification',
      );
    }

    if (
      currentUserTask.verificationStatus === UserTaskVerificationStatus.PASSED
    ) {
      return this.createManualCheckinResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - MAX_MANUAL_CHECKIN_DURATION_SECONDS * 1000,
    );

    if (
      currentUserTask.verificationStatus ===
        UserTaskVerificationStatus.IN_PROGRESS &&
      currentUserTask.manualCheckinStartedAt &&
      currentUserTask.manualCheckinStartedAt > staleBefore
    ) {
      return this.createManualCheckinResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    const startedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          $or: [
            { verificationStatus: { $exists: false } },
            { verificationStatus: UserTaskVerificationStatus.NOT_STARTED },
            { verificationStatus: UserTaskVerificationStatus.FAILED },
            {
              verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
              manualCheckinStartedAt: null,
            },
            {
              verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
              manualCheckinStartedAt: { $lte: staleBefore },
            },
          ],
        },
        {
          $set: {
            verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
            progress: 0,
            verifiedAt: null,
            manualCheckinStartedAt: now,
            manualCheckinEndedAt: null,
            manualCheckinDurationSeconds: 0,
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
        return this.createManualCheckinResponse(
          latestUserTask,
          task.targetValue,
          true,
        );
      }

      throw new ConflictException('Could not start manual check-in');
    }

    return this.createManualCheckinResponse(
      startedUserTask,
      task.targetValue,
      false,
    );
  }

  async finishManualCheckin(userId: string, userTaskId: string) {
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

    if (task.verificationType !== TaskVerificationType.MANUAL_CHECKIN) {
      throw new BadRequestException(
        'Task does not use manual check-in verification',
      );
    }

    if (
      currentUserTask.verificationStatus ===
        UserTaskVerificationStatus.PASSED ||
      currentUserTask.verificationStatus === UserTaskVerificationStatus.FAILED
    ) {
      return this.createManualCheckinResponse(
        currentUserTask,
        task.targetValue,
        true,
      );
    }

    if (
      currentUserTask.status !== UserTaskStatus.IN_PROGRESS ||
      currentUserTask.verificationStatus !==
        UserTaskVerificationStatus.IN_PROGRESS ||
      !currentUserTask.manualCheckinStartedAt
    ) {
      throw new ConflictException('Manual check-in has not been started');
    }

    const now = new Date();
    const durationSeconds = Math.floor(
      (now.getTime() - currentUserTask.manualCheckinStartedAt.getTime()) / 1000,
    );

    if (
      durationSeconds < 0 ||
      durationSeconds > MAX_MANUAL_CHECKIN_DURATION_SECONDS
    ) {
      throw new BadRequestException(
        'Manual check-in duration must be between 0 seconds and 4 hours',
      );
    }

    const targetSeconds = task.targetValue * 60;
    const passed = durationSeconds >= targetSeconds;
    const progressMinutes = Math.min(
      Math.round((durationSeconds / 60) * 100) / 100,
      task.targetValue,
    );
    const finishedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          verificationStatus: UserTaskVerificationStatus.IN_PROGRESS,
          manualCheckinStartedAt: currentUserTask.manualCheckinStartedAt,
        },
        {
          $set: {
            verificationStatus: passed
              ? UserTaskVerificationStatus.PASSED
              : UserTaskVerificationStatus.FAILED,
            progress: progressMinutes,
            verifiedAt: passed ? now : null,
            manualCheckinEndedAt: now,
            manualCheckinDurationSeconds: durationSeconds,
            verificationFailureReason: passed ? null : 'TARGET_NOT_REACHED',
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
        return this.createManualCheckinResponse(
          latestUserTask,
          task.targetValue,
          true,
        );
      }

      throw new ConflictException(
        'Manual check-in state changed while finishing',
      );
    }

    return this.createManualCheckinResponse(
      finishedUserTask,
      task.targetValue,
      false,
    );
  }

  async verifyPhoto(
    userId: string,
    userTaskId: string,
    submitDto: SubmitPhotoVerificationDto,
    image: Express.Multer.File | undefined,
  ) {
    if (!isValidObjectId(userTaskId)) {
      throw new BadRequestException('Invalid user task id');
    }

    if (!image) {
      throw new BadRequestException('Image file is required');
    }

    if (
      image.size < MIN_PHOTO_SIZE_BYTES ||
      image.size > MAX_PHOTO_SIZE_BYTES
    ) {
      throw new BadRequestException('Image size must be between 1 KB and 5 MB');
    }

    const detectedMimeType = this.detectImageMimeType(image.buffer);

    if (!detectedMimeType) {
      throw new BadRequestException(
        'Only JPEG, PNG, or WebP images are allowed',
      );
    }

    const capturedAt = new Date(submitDto.capturedAt);
    const now = new Date();

    if (
      capturedAt.getTime() > now.getTime() + PHOTO_CLOCK_TOLERANCE_MS ||
      now.getTime() - capturedAt.getTime() > PHOTO_CAPTURE_MAX_AGE_MS
    ) {
      throw new BadRequestException(
        'Photo must be captured within the last 5 minutes',
      );
    }

    const userObjectId = new Types.ObjectId(userId);
    const currentUserTask = await this.userTaskModel
      .findOne({
        _id: userTaskId,
        user: userObjectId,
      })
      .select('+submittedPhotoHashes')
      .exec();

    if (!currentUserTask) {
      throw new NotFoundException('User task not found');
    }

    if (currentUserTask.status !== UserTaskStatus.IN_PROGRESS) {
      throw new ConflictException(
        'Only an in-progress task can verify a photo',
      );
    }

    const task = await this.tasksService.findById(
      currentUserTask.task.toString(),
    );

    if (task.verificationType !== TaskVerificationType.PHOTO_AI) {
      throw new BadRequestException('Task does not use photo verification');
    }

    if (
      currentUserTask.verificationStatus === UserTaskVerificationStatus.PASSED
    ) {
      return this.createPhotoResponse(
        currentUserTask,
        task.targetValue,
        true,
        true,
      );
    }

    if (
      capturedAt.getTime() <
      currentUserTask.startedAt.getTime() - PHOTO_CLOCK_TOLERANCE_MS
    ) {
      throw new BadRequestException(
        'Photo was captured before the task was started',
      );
    }

    const photoHash = createHash('sha256').update(image.buffer).digest('hex');
    const submittedHashes = currentUserTask.submittedPhotoHashes ?? [];

    if (submittedHashes.includes(photoHash)) {
      return this.createPhotoResponse(
        currentUserTask,
        task.targetValue,
        false,
        true,
      );
    }

    const reusedPhoto = await this.userTaskModel
      .findOne({
        user: userObjectId,
        _id: { $ne: currentUserTask._id },
        submittedPhotoHashes: photoHash,
      })
      .select('_id')
      .lean()
      .exec();

    if (reusedPhoto) {
      throw new ConflictException(
        'This photo has already been submitted for another task',
      );
    }

    const acceptedLabels = (task.verificationLabels ?? []).map((label) =>
      label.trim().toLowerCase(),
    );

    if (acceptedLabels.length === 0) {
      throw new InternalServerErrorException(
        'Photo verification labels are not configured for this task',
      );
    }

    const highestLabel = submitDto.labels.reduce((best, label) =>
      label.confidence > best.confidence ? label : best,
    );
    const matchingLabels = submitDto.labels.filter((label) =>
      acceptedLabels.includes(label.text.trim().toLowerCase()),
    );
    const matchedLabel = matchingLabels.reduce<
      SubmitPhotoVerificationDto['labels'][number] | null
    >(
      (best, label) =>
        !best || label.confidence > best.confidence ? label : best,
      null,
    );
    const minimumConfidence = task.verificationMinConfidence ?? 0.7;
    const photoAccepted =
      matchedLabel !== null && matchedLabel.confidence >= minimumConfidence;
    const failureReason = !matchedLabel
      ? 'LABEL_NOT_ACCEPTED'
      : photoAccepted
        ? null
        : 'LOW_CONFIDENCE';
    const resultLabel = matchedLabel ?? highestLabel;

    if (!photoAccepted) {
      const rejectedUserTask = await this.userTaskModel
        .findOneAndUpdate(
          {
            _id: userTaskId,
            user: userObjectId,
            status: UserTaskStatus.IN_PROGRESS,
            submittedPhotoHashes: { $ne: photoHash },
          },
          {
            $set: {
              verificationStatus: UserTaskVerificationStatus.FAILED,
              verifiedAt: null,
              verificationFailureReason: failureReason,
              lastPhotoLabel: resultLabel.text.trim(),
              lastPhotoConfidence: resultLabel.confidence,
              lastPhotoCapturedAt: capturedAt,
              lastPhotoMimeType: detectedMimeType,
              lastPhotoSizeBytes: image.size,
            },
            $inc: {
              verificationAttempts: 1,
            },
            $addToSet: {
              submittedPhotoHashes: photoHash,
            },
          },
          {
            new: true,
            runValidators: true,
          },
        )
        .select('+submittedPhotoHashes')
        .exec();

      if (!rejectedUserTask) {
        const latestUserTask = await this.userTaskModel
          .findOne({ _id: userTaskId, user: userObjectId })
          .select('+submittedPhotoHashes')
          .exec();

        if (latestUserTask?.submittedPhotoHashes.includes(photoHash)) {
          return this.createPhotoResponse(
            latestUserTask,
            task.targetValue,
            false,
            true,
          );
        }

        throw new ConflictException(
          'Photo verification state changed while processing',
        );
      }

      return this.createPhotoResponse(
        rejectedUserTask,
        task.targetValue,
        false,
        false,
      );
    }

    const newProgress = Math.min(
      currentUserTask.progress + 1,
      task.targetValue,
    );
    const taskPassed = newProgress >= task.targetValue;
    const verifiedAt = taskPassed ? now : null;
    const verifiedUserTask = await this.userTaskModel
      .findOneAndUpdate(
        {
          _id: userTaskId,
          user: userObjectId,
          status: UserTaskStatus.IN_PROGRESS,
          progress: currentUserTask.progress,
          submittedPhotoHashes: { $ne: photoHash },
        },
        {
          $set: {
            progress: newProgress,
            verificationStatus: taskPassed
              ? UserTaskVerificationStatus.PASSED
              : UserTaskVerificationStatus.IN_PROGRESS,
            verifiedAt,
            verificationFailureReason: null,
            lastPhotoLabel: matchedLabel.text.trim(),
            lastPhotoConfidence: matchedLabel.confidence,
            lastPhotoCapturedAt: capturedAt,
            lastPhotoMimeType: detectedMimeType,
            lastPhotoSizeBytes: image.size,
          },
          $inc: {
            verificationAttempts: 1,
          },
          $addToSet: {
            submittedPhotoHashes: photoHash,
          },
        },
        {
          new: true,
          runValidators: true,
        },
      )
      .select('+submittedPhotoHashes')
      .exec();

    if (!verifiedUserTask) {
      const latestUserTask = await this.userTaskModel
        .findOne({ _id: userTaskId, user: userObjectId })
        .select('+submittedPhotoHashes')
        .exec();

      if (latestUserTask?.submittedPhotoHashes.includes(photoHash)) {
        return this.createPhotoResponse(
          latestUserTask,
          task.targetValue,
          true,
          true,
        );
      }

      throw new ConflictException(
        'Photo verification state changed while processing',
      );
    }

    return this.createPhotoResponse(
      verifiedUserTask,
      task.targetValue,
      true,
      false,
    );
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

  private async getStatisticsRecords(
    userId: Types.ObjectId,
    startAt?: Date,
    endAt?: Date,
  ): Promise<StatisticsRecord[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          user: userId,
          $or: [
            { status: UserTaskStatus.COMPLETED },
            { status: UserTaskStatus.CANCELLED },
            { status: UserTaskStatus.EXPIRED },
            { verificationStatus: UserTaskVerificationStatus.FAILED },
          ],
        },
      },
      {
        $addFields: {
          activityAt: { $ifNull: ['$completedAt', '$updatedAt'] },
        },
      },
    ];

    if (startAt && endAt) {
      pipeline.push({
        $match: {
          activityAt: {
            $gte: startAt,
            $lt: endAt,
          },
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: 'tasks',
          localField: 'task',
          foreignField: '_id',
          as: 'taskDetails',
        },
      },
      { $unwind: '$taskDetails' },
      {
        $project: {
          _id: 0,
          activityAt: 1,
          status: 1,
          verificationStatus: 1,
          distanceMeters: { $ifNull: ['$distanceMeters', 0] },
          gpsDurationSeconds: { $ifNull: ['$durationSeconds', 0] },
          screenTimerDurationSeconds: {
            $ifNull: ['$screenTimerDurationSeconds', 0],
          },
          manualCheckinDurationSeconds: {
            $ifNull: ['$manualCheckinDurationSeconds', 0],
          },
          rewardGranted: 1,
          task: {
            verificationType: '$taskDetails.verificationType',
            rewardXp: '$taskDetails.rewardXp',
            rewardLp: '$taskDetails.rewardLp',
          },
        },
      },
    );

    return await this.userTaskModel
      .aggregate<StatisticsRecord>(pipeline)
      .exec();
  }

  private summarizeStatistics(records: StatisticsRecord[]) {
    const summary = {
      totalTasks: records.length,
      completed: 0,
      invalid: 0,
      cancelled: 0,
      completionRate: 0,
      distanceMeters: 0,
      outdoorSeconds: 0,
      offlineSeconds: 0,
      xpEarned: 0,
      leafPointsEarned: 0,
    };

    for (const record of records) {
      const historyStatus = this.getHistoryStatus(record);

      if (historyStatus === HistoryFilter.DONE) {
        summary.completed += 1;
        summary.distanceMeters += record.distanceMeters;

        if (
          record.task.verificationType === TaskVerificationType.GPS_DISTANCE
        ) {
          summary.outdoorSeconds += record.gpsDurationSeconds;
        }

        summary.offlineSeconds +=
          record.screenTimerDurationSeconds +
          record.manualCheckinDurationSeconds;

        if (record.rewardGranted) {
          summary.xpEarned += record.task.rewardXp;
          summary.leafPointsEarned += record.task.rewardLp;
        }
      } else if (historyStatus === HistoryFilter.CANCELLED) {
        summary.cancelled += 1;
      } else {
        summary.invalid += 1;
      }
    }

    summary.distanceMeters = Math.round(summary.distanceMeters * 100) / 100;
    summary.completionRate =
      summary.totalTasks === 0
        ? 0
        : Math.round((summary.completed / summary.totalTasks) * 100);

    return summary;
  }

  private getHistoryStatus(
    record: Pick<StatisticsRecord, 'status' | 'verificationStatus'>,
  ): HistoryFilter {
    if (record.status === UserTaskStatus.COMPLETED) {
      return HistoryFilter.DONE;
    }

    if (record.status === UserTaskStatus.CANCELLED) {
      return HistoryFilter.CANCELLED;
    }

    return HistoryFilter.INVALID;
  }

  private getStatisticsRange(period: StatisticsPeriod): PeriodRange {
    const localNow = new Date(
      Date.now() + VIETNAM_UTC_OFFSET_HOURS * 60 * 60 * 1000,
    );
    const year = localNow.getUTCFullYear();
    const month = localNow.getUTCMonth();
    const day = localNow.getUTCDate();
    let startLocal: Date;
    let endLocal: Date;
    let previousStartLocal: Date;

    if (period === StatisticsPeriod.DAY) {
      startLocal = new Date(Date.UTC(year, month, day));
      endLocal = new Date(Date.UTC(year, month, day + 1));
      previousStartLocal = new Date(Date.UTC(year, month, day - 1));
    } else if (period === StatisticsPeriod.WEEK) {
      const todayLocal = new Date(Date.UTC(year, month, day));
      const daysSinceMonday = (todayLocal.getUTCDay() + 6) % 7;
      startLocal = new Date(Date.UTC(year, month, day - daysSinceMonday));
      endLocal = new Date(startLocal);
      endLocal.setUTCDate(endLocal.getUTCDate() + 7);
      previousStartLocal = new Date(startLocal);
      previousStartLocal.setUTCDate(previousStartLocal.getUTCDate() - 7);
    } else {
      startLocal = new Date(Date.UTC(year, month, 1));
      endLocal = new Date(Date.UTC(year, month + 1, 1));
      previousStartLocal = new Date(Date.UTC(year, month - 1, 1));
    }

    return {
      startAt: this.vietnamLocalToUtc(startLocal),
      endAt: this.vietnamLocalToUtc(endLocal),
      previousStartAt: this.vietnamLocalToUtc(previousStartLocal),
      previousEndAt: this.vietnamLocalToUtc(startLocal),
    };
  }

  private vietnamLocalToUtc(localDate: Date): Date {
    return new Date(
      localDate.getTime() - VIETNAM_UTC_OFFSET_HOURS * 60 * 60 * 1000,
    );
  }

  private buildStatisticsSeries(
    records: StatisticsRecord[],
    period: StatisticsPeriod,
    startAt: Date,
    endAt: Date,
  ) {
    const bucketCount =
      period === StatisticsPeriod.DAY
        ? 6
        : period === StatisticsPeriod.WEEK
          ? 7
          : Math.ceil(
              (endAt.getTime() - startAt.getTime()) / (7 * 24 * 60 * 60 * 1000),
            );
    const weekdayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    const series = Array.from({ length: bucketCount }, (_, index) => ({
      key: String(index),
      label:
        period === StatisticsPeriod.DAY
          ? `${String(index * 4).padStart(2, '0')}:00`
          : period === StatisticsPeriod.WEEK
            ? weekdayLabels[index]
            : `Tuần ${index + 1}`,
      completed: 0,
      invalid: 0,
      cancelled: 0,
      outdoorSeconds: 0,
    }));

    for (const record of records) {
      const elapsedHours =
        (record.activityAt.getTime() - startAt.getTime()) / (60 * 60 * 1000);
      const bucketIndex =
        period === StatisticsPeriod.DAY
          ? Math.floor(elapsedHours / 4)
          : period === StatisticsPeriod.WEEK
            ? Math.floor(elapsedHours / 24)
            : Math.floor(elapsedHours / (7 * 24));
      const bucket = series[bucketIndex];

      if (!bucket) {
        continue;
      }

      const historyStatus = this.getHistoryStatus(record);

      if (historyStatus === HistoryFilter.DONE) {
        bucket.completed += 1;
      } else if (historyStatus === HistoryFilter.CANCELLED) {
        bucket.cancelled += 1;
      } else {
        bucket.invalid += 1;
      }

      if (
        historyStatus === HistoryFilter.DONE &&
        record.task.verificationType === TaskVerificationType.GPS_DISTANCE
      ) {
        bucket.outdoorSeconds += record.gpsDurationSeconds;
      }
    }

    return series;
  }

  private calculatePercentChange(current: number, previous: number) {
    if (previous === 0) {
      return current === 0 ? 0 : null;
    }

    return Math.round(((current - previous) / previous) * 100);
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

  private createManualCheckinResponse(
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
      targetSeconds: targetValue * 60,
      checkinStartedAt: userTask.manualCheckinStartedAt,
      checkinEndedAt: userTask.manualCheckinEndedAt,
      durationSeconds: userTask.manualCheckinDurationSeconds,
      failureReason: userTask.verificationFailureReason,
      alreadyProcessed,
    };
  }

  private createScreenTimerResponse(
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
      targetSeconds: targetValue * 60,
      timerStartedAt: userTask.screenTimerStartedAt,
      timerEndedAt: userTask.screenTimerEndedAt,
      screenOffAt: userTask.screenOffAt,
      screenOnAt: userTask.screenOnAt,
      durationSeconds: userTask.screenTimerDurationSeconds,
      failureReason: userTask.verificationFailureReason,
      alreadyProcessed,
    };
  }

  private createPhotoResponse(
    userTask: UserTaskDocument,
    targetValue: number,
    photoAccepted: boolean,
    alreadyProcessed: boolean,
  ) {
    return {
      userTaskId: userTask._id.toString(),
      verificationStatus: userTask.verificationStatus,
      passed: userTask.verificationStatus === UserTaskVerificationStatus.PASSED,
      photoAccepted,
      progress: userTask.progress,
      targetValue,
      acceptedPhotoCount: userTask.progress,
      requiredPhotoCount: targetValue,
      result: {
        label: userTask.lastPhotoLabel,
        confidence: userTask.lastPhotoConfidence,
        capturedAt: userTask.lastPhotoCapturedAt,
      },
      failureReason: userTask.verificationFailureReason,
      alreadyProcessed,
    };
  }

  private detectImageMimeType(buffer: Buffer): string | null {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    ) {
      return 'image/jpeg';
    }

    const pngSignature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    if (
      buffer.length >= pngSignature.length &&
      buffer.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      return 'image/png';
    }

    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }

    return null;
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
