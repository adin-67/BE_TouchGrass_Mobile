import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

import { User } from '../../users/schemas/user.schema';

export type AppControlRuleDocument = HydratedDocument<AppControlRule>;

@Schema({ timestamps: true, versionKey: false })
export class AppControlRule {
  createdAt!: Date;
  updatedAt!: Date;

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

  @Prop({ required: true, trim: true, maxlength: 100 })
  appName!: string;

  @Prop({ default: true })
  enabled!: boolean;

  @Prop({ required: true, min: 1, max: 1440 })
  dailyLimitMinutes!: number;

  @Prop({
    type: [Number],
    required: true,
    validate: {
      validator: (days: number[]) =>
        days.length >= 1 &&
        days.length <= 7 &&
        new Set(days).size === days.length &&
        days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6),
      message: 'activeDays must contain unique integers from 0 to 6',
    },
  })
  activeDays!: number[];

  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  startTime!: string;

  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
  endTime!: string;
}

export const AppControlRuleSchema =
  SchemaFactory.createForClass(AppControlRule);
AppControlRuleSchema.index({ user: 1, packageName: 1 }, { unique: true });
