import {
  Patch,
  Param,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { ListUserTasksQueryDto } from './dto/list-user-tasks-query.dto';

import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiParam,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { StartUserTaskDto } from './dto/start-user-task.dto';
import { UserTasksService } from './user-tasks.service';
import { UpdateUserTaskProgressDto } from './dto/update-user-task-progress.dto';
import { FinishGpsTrackingDto } from './dto/finish-gps-tracking.dto';
@ApiTags('user-tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user-tasks')
export class UserTasksController {
  constructor(private readonly userTasksService: UserTasksService) {}

  @Get()
  @ApiOperation({
    summary: 'Lấy danh sách nhiệm vụ đã nhận',
  })
  async findMyTasks(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListUserTasksQueryDto,
  ) {
    return await this.userTasksService.findAllForUser(request.user.sub, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Lấy chi tiết nhiệm vụ đã nhận',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của UserTask',
    example: '6a79dd4e2971fdd0986116bd',
  })
  async findMyTaskById(
    @Req() request: AuthenticatedRequest,
    @Param('id') userTaskId: string,
  ) {
    return await this.userTasksService.findByIdForUser(
      request.user.sub,
      userTaskId,
    );
  }

  @Patch(':id/progress')
  @ApiOperation({
    summary: 'Cập nhật tiến độ nhiệm vụ',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của UserTask',
  })
  async updateMyTaskProgress(
    @Req() request: AuthenticatedRequest,
    @Param('id') userTaskId: string,
    @Body() updateDto: UpdateUserTaskProgressDto,
  ) {
    return await this.userTasksService.updateProgress(
      request.user.sub,
      userTaskId,
      updateDto,
    );
  }

  @Post(':id/complete')
  @ApiOperation({
    summary: 'Hoàn thành nhiệm vụ',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của UserTask',
  })
  async completeMyTask(
    @Req() request: AuthenticatedRequest,
    @Param('id') userTaskId: string,
  ) {
    return await this.userTasksService.completeTask(
      request.user.sub,
      userTaskId,
    );
  }

  @Post(':id/gps/start')
  @ApiOperation({
    summary: 'Bắt đầu phiên xác minh GPS',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của UserTask sử dụng GPS',
  })
  async startMyGpsTracking(
    @Req() request: AuthenticatedRequest,
    @Param('id') userTaskId: string,
  ) {
    return await this.userTasksService.startGpsTracking(
      request.user.sub,
      userTaskId,
    );
  }

  @Post(':id/gps/finish')
  @ApiOperation({
    summary: 'Gửi điểm GPS và kết thúc xác minh',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của UserTask đang theo dõi GPS',
  })
  async finishMyGpsTracking(
    @Req() request: AuthenticatedRequest,
    @Param('id') userTaskId: string,
    @Body() finishDto: FinishGpsTrackingDto,
  ) {
    return await this.userTasksService.finishGpsTracking(
      request.user.sub,
      userTaskId,
      finishDto,
    );
  }

  @Post(':id/claim-reward')
  @ApiOperation({
    summary: 'Nhận phần thưởng nhiệm vụ',
  })
  @ApiParam({
    name: 'id',
    description: 'ID của UserTask đã hoàn thành',
  })
  async claimMyTaskReward(
    @Req() request: AuthenticatedRequest,
    @Param('id') userTaskId: string,
  ) {
    return await this.userTasksService.claimReward(
      request.user.sub,
      userTaskId,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Nhận một nhiệm vụ',
  })
  async startTask(
    @Req() request: AuthenticatedRequest,
    @Body() startUserTaskDto: StartUserTaskDto,
  ) {
    const userTask = await this.userTasksService.startTask(
      request.user.sub,
      startUserTaskDto,
    );

    return {
      id: userTask._id.toString(),
      userId: userTask.user.toString(),
      taskId: userTask.task.toString(),
      cycleKey: userTask.cycleKey,
      status: userTask.status,
      progress: userTask.progress,
      startedAt: userTask.startedAt,
      completedAt: userTask.completedAt,
      expiresAt: userTask.expiresAt,
      rewardGranted: userTask.rewardGranted,
      verificationStatus: userTask.verificationStatus,
      verificationAttempts: userTask.verificationAttempts,
    };
  }
}
