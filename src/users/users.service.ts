import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import type { CreateUserData } from './interfaces/create-user-data';

import { User, type UserDocument } from './schemas/user.schema';
import type { UpdateProfileDto } from './dto/update-profile.dto';

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
          new: true, //Yêu cầu Mongoose trả document sau khi cập nhật
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
    unlockMinutes: number,
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
        {
          $inc: {
            xp: rewardXp,
            leafPoints: rewardLp,
            unlockMinutesBalance: unlockMinutes,
          },
          $addToSet: {
            rewardedUserTasks: userTaskObjectId,
          },
        },
        {
          new: true,
          runValidators: true,
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
}
