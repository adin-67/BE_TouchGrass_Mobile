import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

import { User } from '../../users/schemas/user.schema';
import { UserTask } from '../../user-tasks/schemas/user-task.schema';

export enum TemporaryUnlockStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export type TemporaryUnlockSessionDocument =
  HydratedDocument<TemporaryUnlockSession>;

@Schema({ timestamps: true, versionKey: false })
export class TemporaryUnlockSession {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  user!: Types.ObjectId;

  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 200,
    match: /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/,
  })
  packageName!: string;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ required: true, min: 1, max: 1440 })
  minutesSpent!: number;

  @Prop({ type: Types.ObjectId, ref: UserTask.name, default: null })
  sourceUserTask!: Types.ObjectId | null;

  @Prop({
    type: String,
    enum: TemporaryUnlockStatus,
    default: TemporaryUnlockStatus.ACTIVE,
    index: true,
  })
  status!: TemporaryUnlockStatus;

  @Prop({ required: true, maxlength: 100 })
  operationKey!: string;

  @Prop({ default: false, select: false })
  debited!: boolean;
}

export const TemporaryUnlockSessionSchema = SchemaFactory.createForClass(
  TemporaryUnlockSession,
);
TemporaryUnlockSessionSchema.index(
  { user: 1, operationKey: 1 },
  { unique: true },
);
TemporaryUnlockSessionSchema.index({ user: 1, packageName: 1, expiresAt: -1 });
TemporaryUnlockSessionSchema.index(
  { sourceUserTask: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceUserTask: { $type: 'objectId' } },
  },
);
