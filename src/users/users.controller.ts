import {
  Body,
  Patch,
  Controller,
  Get,
  NotFoundException,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getMyProfile(@Req() req: AuthenticatedRequest) {
    const user = await this.usersService.findById(req.user.sub);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return {
      id: user._id.toString(),
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      dateOfBirth: user.dateOfBirth,
      goals: user.goals,
      xp: user.xp,
      level: user.level,
      leafPoints: user.leafPoints,
      role: user.role,
    };
  }
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async updateMyProfile(
    @Req() request: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const updatedUser = await this.usersService.updateProfile(
      request.user.sub,
      updateProfileDto,
    );

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return {
      id: updatedUser._id.toString(),
      fullName: updatedUser.fullName,
      email: updatedUser.email,
      avatarUrl: updatedUser.avatarUrl,
      dateOfBirth: updatedUser.dateOfBirth,
      goals: updatedUser.goals,
      xp: updatedUser.xp,
      level: updatedUser.level,
      leafPoints: updatedUser.leafPoints,
      role: updatedUser.role,
    };
  }
}
