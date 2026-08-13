import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

import { User } from '../../users/schemas/user.schema';

@Schema({ _id: false, versionKey: false })
export class AppUsageItem {
  @Prop({
    required: true,
    trim: true,
    lowercase: true,
    maxlength: 200,
    match: /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/,
  })
  packageName!: string;

  @Prop({ required: true, min: 0, max: 86400 })
  foregroundSeconds!: number;
}

const AppUsageItemSchema = SchemaFactory.createForClass(AppUsageItem);
export type UsageSummaryDocument = HydratedDocument<UsageSummary>;

@Schema({ timestamps: true, versionKey: false })
export class UsageSummary {
  createdAt!: Date;
  updatedAt!: Date;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  user!: Types.ObjectId;

  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  date!: string;

  @Prop({ required: true, min: 0, max: 86400 })
  totalScreenTimeSeconds!: number;

  @Prop({ type: [AppUsageItemSchema], default: [] })
  apps!: AppUsageItem[];
}

export const UsageSummarySchema = SchemaFactory.createForClass(UsageSummary);
UsageSummarySchema.index({ user: 1, date: 1 }, { unique: true });
