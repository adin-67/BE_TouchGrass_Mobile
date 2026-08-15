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
}

export const AppControlRuleSchema =
  SchemaFactory.createForClass(AppControlRule);
AppControlRuleSchema.index({ user: 1, packageName: 1 }, { unique: true });
