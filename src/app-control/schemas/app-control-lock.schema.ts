import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

import { User } from '../../users/schemas/user.schema';

export type AppControlLockDocument = HydratedDocument<AppControlLock>;

@Schema({ versionKey: false })
export class AppControlLock {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  user!: Types.ObjectId;

  @Prop({ required: true, trim: true, lowercase: true, maxlength: 200 })
  packageName!: string;

  @Prop({ required: true })
  lockToken!: string;

  @Prop({ required: true })
  lockedUntil!: Date;
}

export const AppControlLockSchema =
  SchemaFactory.createForClass(AppControlLock);
AppControlLockSchema.index({ user: 1, packageName: 1 }, { unique: true });
AppControlLockSchema.index({ lockedUntil: 1 }, { expireAfterSeconds: 0 });
