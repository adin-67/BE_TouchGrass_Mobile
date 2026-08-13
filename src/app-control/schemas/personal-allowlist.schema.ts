import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

import { User } from '../../users/schemas/user.schema';

export type PersonalAllowlistDocument = HydratedDocument<PersonalAllowlist>;

@Schema({ timestamps: true, versionKey: false })
export class PersonalAllowlist {
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

  @Prop({ type: String, default: null, trim: true, maxlength: 300 })
  reason!: string | null;
}

export const PersonalAllowlistSchema =
  SchemaFactory.createForClass(PersonalAllowlist);
PersonalAllowlistSchema.index({ user: 1, packageName: 1 }, { unique: true });
