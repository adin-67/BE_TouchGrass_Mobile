import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type TaskDocument = HydratedDocument<Task>;

export enum TaskCategory {
  WALK = 'WALK',
  PHOTO = 'PHOTO',
  OFFLINE = 'OFFLINE',
  WELLNESS = 'WELLNESS',
}

export enum TaskDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

export enum TaskVerificationType {
  GPS_DISTANCE = 'GPS_DISTANCE',
  PHOTO_AI = 'PHOTO_AI',
  SCREEN_OFF_TIMER = 'SCREEN_OFF_TIMER',
  MANUAL_CHECKIN = 'MANUAL_CHECKIN',
}

export enum TaskFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  ANYTIME = 'ANYTIME',
}

export enum TaskTargetUnit {
  METER = 'METER',
  PHOTO = 'PHOTO',
  MINUTE = 'MINUTE',
}

@Schema({
  timestamps: true,
  versionKey: false,
})
export class Task {
  @Prop({
    required: true,
    unique: true,
    immutable: true,
    uppercase: true,
    trim: true,
    match: /^[A-Z0-9_]+$/,
  })
  code!: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 100,
  })
  title!: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 500,
  })
  description!: string;

  @Prop({
    type: String,
    enum: TaskCategory,
    default: TaskCategory.WALK,
    index: true,
  })
  category!: TaskCategory;

  @Prop({
    type: String,
    enum: TaskVerificationType,
    required: true,
    index: true,
  })
  verificationType!: TaskVerificationType;

  @Prop({
    type: [String],
    default: [],
  })
  verificationLabels?: string[];

  @Prop({
    type: String,
    enum: TaskFrequency,
    required: true,
    index: true,
  })
  frequency!: TaskFrequency;

  @Prop({
    required: true,
    trim: true,
    maxlength: 10,
    default: '🌿',
  })
  emoji!: string;

  @Prop({
    type: String,
    enum: TaskDifficulty,
    default: TaskDifficulty.EASY,
    index: true,
  })
  difficulty!: TaskDifficulty;

  @Prop({
    required: true,
    min: 0,
  })
  rewardXp!: number;

  @Prop({
    required: true,
    min: 0,
  })
  rewardLp!: number;

  @Prop({
    required: true,
    min: 0,
  })
  unlockMinutes!: number;

  @Prop({
    required: true,
    min: 1,
  })
  targetValue!: number;

  @Prop({
    type: String,
    enum: TaskTargetUnit,
    required: true,
  })
  targetUnit!: TaskTargetUnit;

  @Prop({
    required: true,
    min: 1,
  })
  estimatedMinutes!: number;

  @Prop({
    type: [String],
    default: [],
  })
  instructions!: string[];

  @Prop({
    type: String,
    default: null,
    match: /^([01]\d|2[0-3]):[0-5]\d$/,
  })
  startTime!: string | null;

  @Prop({
    type: String,
    default: null,
    match: /^([01]\d|2[0-3]):[0-5]\d$/,
  })
  endTime!: string | null;

  @Prop({
    default: true,
    index: true,
  })
  active!: boolean;
}

export const TaskSchema = SchemaFactory.createForClass(Task);
