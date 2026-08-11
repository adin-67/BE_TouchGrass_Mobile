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

@Schema({
  timestamps: true,
  versionKey: false,
})
export class UserTask {
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
