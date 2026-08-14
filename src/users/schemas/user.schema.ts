import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

export enum UserRoles {
  USER = 'user',
  ADMIN = 'admin',
}

export enum AuthProvider {
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
}

@Schema({ _id: false, versionKey: false })
export class UserAuthProvider {
  @Prop({ type: String, enum: AuthProvider, required: true })
  provider!: AuthProvider;

  @Prop({ required: true, trim: true })
  providerAccountId!: string;
}

const UserAuthProviderSchema = SchemaFactory.createForClass(UserAuthProvider);

@Schema({
  timestamps: true,
  versionKey: false,
})
export class User {
  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxLength: 80,
  })
  fullName!: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  })
  email!: string;
  @Prop({
    type: String,
    default: null,
    select: false,
  })
  passwordHash!: string | null;

  @Prop({ type: [UserAuthProviderSchema], default: [] })
  authProviders!: UserAuthProvider[];

  @Prop({
    type: String,
    default: null,
  })
  avatarUrl!: string | null;

  @Prop({
    type: Date,
    default: null,
  })
  dateOfBirth!: Date | null;

  @Prop({
    type: [String],
    default: [],
  })
  goals!: string[];

  @Prop({
    default: 0,
    min: 0,
  })
  xp!: number;

  @Prop({
    default: 1,
    min: 1,
  })
  level!: number;

  @Prop({
    default: 0,
    min: 0,
  })
  leafPoints!: number;
  @Prop({
    type: String,
    enum: UserRoles,
    default: UserRoles.USER,
  })
  role!: UserRoles;

  @Prop({
    default: 0,
    min: 0,
  })
  unlockMinutesBalance!: number;

  @Prop({
    type: [Types.ObjectId],
    ref: 'UserTask',
    default: [],
    select: false,
  })
  rewardedUserTasks!: Types.ObjectId[];

  @Prop({
    type: [String],
    default: [],
    select: false,
  })
  unlockOperationKeys!: string[];
}
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index(
  {
    'authProviders.provider': 1,
    'authProviders.providerAccountId': 1,
  },
  {
    unique: true,
    partialFilterExpression: { 'authProviders.0': { $exists: true } },
  },
);
