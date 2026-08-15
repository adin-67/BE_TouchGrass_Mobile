import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type { CreateUserData } from './interfaces/create-user-data';

import { AuthProvider, User, type UserDocument } from './schemas/user.schema';
import type { UpdateProfileDto } from './dto/update-profile.dto';

const XP_PER_LEVEL = 100;

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // cho đăng ký
  async findByEmail(email: string): Promise<UserDocument | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .exec();
    return user;
  }
  async findById(userId: string): Promise<UserDocument | null> {
    const user = await this.userModel.findById(userId).exec();
    return user;
  }

  async updateProfile(
    userId: string,
    data: UpdateProfileDto,
  ): Promise<UserDocument | null> {
    const updatedUser = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          $set: data,
        },
        {
          returnDocument: 'after', //Yêu cầu Mongoose trả document sau khi cập nhật
          runValidators: true, //Yêu cầu Mongoose tiếp tục kiểm tra các luật trong UserSchema
        },
      )
      .exec();

    return updatedUser;
  }

  // dành cho đăng nhập
  async findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .select('+passwordHash')
      .exec();
    return user;
  }

  async grantTaskReward(
    userId: string,
    userTaskId: string,
    rewardXp: number,
    rewardLp: number,
  ): Promise<UserDocument | null> {
    const userTaskObjectId = new Types.ObjectId(userTaskId);

    const rewardedUser = await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          rewardedUserTasks: {
            $ne: userTaskObjectId,
          },
        },
        [
          {
            $set: {
              xp: {
                $add: [{ $ifNull: ['$xp', 0] }, rewardXp],
              },
              leafPoints: {
                $add: [{ $ifNull: ['$leafPoints', 0] }, rewardLp],
              },
              rewardedUserTasks: {
                $setUnion: [
                  { $ifNull: ['$rewardedUserTasks', []] },
                  [userTaskObjectId],
                ],
              },
            },
          },
          {
            $set: {
              level: {
                $add: [
                  {
                    $floor: {
                      $divide: ['$xp', XP_PER_LEVEL],
                    },
                  },
                  1,
                ],
              },
            },
          },
        ],
        {
          returnDocument: 'after',
          updatePipeline: true,
        },
      )
      .exec();

    return rewardedUser;
  }
  async createUser(data: CreateUserData): Promise<UserDocument> {
    const newUser = new this.userModel({
      fullName: data.fullName.trim(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
    });
    const savedUser = await newUser.save();
    return savedUser;
  }

  async findByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<UserDocument | null> {
    return await this.userModel
      .findOne({
        authProviders: {
          $elemMatch: { provider, providerAccountId },
        },
      })
      .exec();
  }

  async createGoogleUser(data: {
    email: string;
    fullName: string;
    avatarUrl: string | null;
    providerAccountId: string;
  }): Promise<UserDocument> {
    return await this.userModel.create({
      email: data.email.toLowerCase().trim(),
      fullName: data.fullName.trim(),
      avatarUrl: data.avatarUrl,
      passwordHash: null,
      authProviders: [
        {
          provider: AuthProvider.GOOGLE,
          providerAccountId: data.providerAccountId,
        },
      ],
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { passwordHash } })
      .exec();
  }

  async spendLeafPoints(
    userId: string,
    leafPointCost: number,
    operationKey: string,
  ): Promise<UserDocument | null> {
    return await this.userModel
      .findOneAndUpdate(
        {
          _id: userId,
          leafPoints: { $gte: leafPointCost },
          unlockOperationKeys: { $ne: operationKey },
        },
        {
          $inc: { leafPoints: -leafPointCost },
          $addToSet: { unlockOperationKeys: operationKey },
        },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();
  }

  async hasUnlockOperation(
    userId: string,
    operationKey: string,
  ): Promise<boolean> {
    const user = await this.userModel
      .findOne({ _id: userId, unlockOperationKeys: operationKey })
      .select('_id')
      .lean()
      .exec();
    return user !== null;
  }

  async clearUnlockOperations(userId: string): Promise<void> {
    await this.userModel
      .updateOne({ _id: userId }, { $set: { unlockOperationKeys: [] } })
      .exec();
  }
}
