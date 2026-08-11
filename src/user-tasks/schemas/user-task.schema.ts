import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

import { User } from '../../users/schemas/user.schema';
import { Task } from '../../tasks/schemas/task.schema';

export type UserTaskDocument = HydratedDocument<UserTask>;

export enum UserTaskStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum UserTaskVerificationStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  PASSED = 'PASSED',
  FAILED = 'FAILED',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class UserTask {
  createdAt!: Date;

  updatedAt!: Date;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  user!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Task.name,
    required: true,
    index: true,
  })
  task!: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    maxlength: 50,
  })
  cycleKey!: string;

  @Prop({
    type: String,
    enum: UserTaskStatus,
    default: UserTaskStatus.IN_PROGRESS,
    index: true,
  })
  status!: UserTaskStatus;

  @Prop({
    default: 0,
    min: 0,
  })
  progress!: number;

  @Prop({
    type: Date,
    default: Date.now,
  })
  startedAt!: Date;

  @Prop({
    type: Date,
    default: null,
  })
  completedAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  expiresAt!: Date | null;

  @Prop({
    default: false,
  })
  rewardGranted!: boolean;

  @Prop({
    type: String,
    enum: UserTaskVerificationStatus,
    default: UserTaskVerificationStatus.NOT_STARTED,
    index: true,
  })
  verificationStatus!: UserTaskVerificationStatus;

  @Prop({
    default: 0,
    min: 0,
  })
  verificationAttempts!: number;

  @Prop({
    type: Date,
    default: null,
  })
  verifiedAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  trackingStartedAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  trackingEndedAt!: Date | null;

  @Prop({
    default: 0,
    min: 0,
  })
  distanceMeters!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  durationSeconds!: number;

  @Prop({
    type: Date,
    default: null,
  })
  screenTimerStartedAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  screenTimerEndedAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  screenOffAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  screenOnAt!: Date | null;

  @Prop({
    default: 0,
    min: 0,
  })
  screenTimerDurationSeconds!: number;

  @Prop({
    type: Date,
    default: null,
  })
  manualCheckinStartedAt!: Date | null;

  @Prop({
    type: Date,
    default: null,
  })
  manualCheckinEndedAt!: Date | null;

  @Prop({
    default: 0,
    min: 0,
  })
  manualCheckinDurationSeconds!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  averageSpeedKmh!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  gpsSampleCount!: number;

  @Prop({
    type: String,
    default: null,
    maxlength: 200,
  })
  verificationFailureReason!: string | null;

  @Prop({
    type: [String],
    default: [],
    select: false,
  })
  submittedPhotoHashes!: string[];

  @Prop({
    type: String,
    default: null,
    maxlength: 100,
  })
  lastPhotoLabel!: string | null;

  @Prop({
    type: Number,
    default: null,
    min: 0,
    max: 1,
  })
  lastPhotoConfidence!: number | null;

  @Prop({
    type: Date,
    default: null,
  })
  lastPhotoCapturedAt!: Date | null;

  @Prop({
    type: String,
    default: null,
    enum: ['image/jpeg', 'image/png', 'image/webp'],
  })
  lastPhotoMimeType!: string | null;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  lastPhotoSizeBytes!: number;
}

export const UserTaskSchema = SchemaFactory.createForClass(UserTask);

UserTaskSchema.index(
  {
    user: 1,
    task: 1,
    cycleKey: 1,
  },
  {
    unique: true,
  },
);

UserTaskSchema.index({
  user: 1,
  status: 1,
  createdAt: -1,
});

UserTaskSchema.index({
  user: 1,
  completedAt: -1,
});

UserTaskSchema.index({
  user: 1,
  verificationStatus: 1,
  updatedAt: -1,
});
