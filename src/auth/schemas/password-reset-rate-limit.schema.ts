import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type PasswordResetRateLimitDocument =
  HydratedDocument<PasswordResetRateLimit>;

@Schema({ timestamps: true, versionKey: false })
export class PasswordResetRateLimit {
  @Prop({ required: true, unique: true })
  emailHash!: string;

  @Prop({ required: true })
  windowStartedAt!: Date;

  @Prop({ required: true, min: 1 })
  requestCount!: number;
}

export const PasswordResetRateLimitSchema = SchemaFactory.createForClass(
  PasswordResetRateLimit,
);
PasswordResetRateLimitSchema.index(
  { updatedAt: 1 },
  { expireAfterSeconds: 3600 },
);
