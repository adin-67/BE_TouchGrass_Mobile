import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { AppControlService } from './app-control.service';
import {
  AllowlistListResponseDto,
  AllowlistResponseDto,
  AppControlRuleListResponseDto,
  AppControlRuleResponseDto,
  ProtectedPackagesResponseDto,
  UnlockOptionsResponseDto,
  UnlockResponseDto,
  UnlockStatusResponseDto,
  UsageSummaryRecordResponseDto,
  UsageSummaryResponseDto,
} from './dto/app-control-response.dto';
import { CreateAllowlistDto } from './dto/create-allowlist.dto';
import { CreateAppControlRuleDto } from './dto/create-rule.dto';
import { CreateTemporaryUnlockDto } from './dto/create-unlock.dto';
import { UpdateAppControlRuleDto } from './dto/update-rule.dto';
import { UpsertUsageSummaryDto } from './dto/usage-summary.dto';

@ApiTags('app-control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('app-control')
export class AppControlController {
  constructor(private readonly appControlService: AppControlService) {}

  @Get('rules')
  @ApiOkResponse({ type: AppControlRuleListResponseDto })
  listRules(@Req() request: AuthenticatedRequest) {
    return this.appControlService.listRules(request.user.sub);
  }

  @Post('rules')
  @ApiCreatedResponse({ type: AppControlRuleResponseDto })
  createRule(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAppControlRuleDto,
  ) {
    return this.appControlService.createRule(request.user.sub, dto);
  }

  @Get('rules/:id')
  @ApiOkResponse({ type: AppControlRuleResponseDto })
  getRule(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.appControlService.getRule(request.user.sub, id);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Chỉ bật hoặc tắt rule của người dùng hiện tại' })
  @ApiOkResponse({ type: AppControlRuleResponseDto })
  updateRule(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateAppControlRuleDto,
  ) {
    return this.appControlService.updateRule(request.user.sub, id, dto);
  }

  @Delete('rules/:id')
  deleteRule(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.appControlService.deleteRule(request.user.sub, id);
  }

  @Get('allowlist')
  @ApiOkResponse({ type: AllowlistListResponseDto })
  listAllowlist(@Req() request: AuthenticatedRequest) {
    return this.appControlService.listAllowlist(request.user.sub);
  }

  @Post('allowlist')
  @ApiCreatedResponse({ type: AllowlistResponseDto })
  createAllowlist(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAllowlistDto,
  ) {
    return this.appControlService.createAllowlist(request.user.sub, dto);
  }

  @Delete('allowlist/:id')
  deleteAllowlist(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.appControlService.deleteAllowlist(request.user.sub, id);
  }

  @Get('unlock-options')
  @ApiOperation({ summary: 'Lấy bảng giá mở khóa do server quản lý' })
  @ApiOkResponse({ type: UnlockOptionsResponseDto })
  getUnlockOptions() {
    return this.appControlService.getUnlockOptions();
  }

  @Get('protected-packages')
  @ApiOperation({ summary: 'Lấy danh sách package hệ thống không được khóa' })
  @ApiOkResponse({ type: ProtectedPackagesResponseDto })
  getProtectedPackages() {
    return this.appControlService.getProtectedPackages();
  }

  @Post('unlock')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Mua thời gian mở khóa tạm thời bằng Leaf Point',
    description:
      'Giá và số phút được lấy từ option phía server. Nếu package đã có phiên còn hiệu lực, thời gian mới được cộng từ expiresAt hiện tại. Retry phải dùng lại cùng Idempotency-Key.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    example: 'unlock-01J5YH6QF8',
  })
  @ApiCreatedResponse({ type: UnlockResponseDto })
  createUnlock(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') operationKey: string | undefined,
    @Body() dto: CreateTemporaryUnlockDto,
  ) {
    return this.appControlService.createUnlock(
      request.user.sub,
      dto,
      operationKey,
    );
  }

  @Get('unlock/:packageName/status')
  @ApiOkResponse({ type: UnlockStatusResponseDto })
  getUnlockStatus(
    @Req() request: AuthenticatedRequest,
    @Param('packageName') packageName: string,
  ) {
    return this.appControlService.getUnlockStatus(
      request.user.sub,
      packageName,
    );
  }

  @Post('usage-summary')
  @ApiOperation({
    summary: 'Lưu UsageStats tổng hợp do người dùng đồng ý đồng bộ',
  })
  @ApiCreatedResponse({ type: UsageSummaryRecordResponseDto })
  upsertUsageSummary(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpsertUsageSummaryDto,
  ) {
    return this.appControlService.upsertUsageSummary(request.user.sub, dto);
  }

  @Get('summary')
  @ApiOkResponse({ type: UsageSummaryResponseDto })
  getSummary(@Req() request: AuthenticatedRequest) {
    return this.appControlService.getSummary(request.user.sub);
  }

  @Delete('data')
  @ApiOperation({ summary: 'Xóa toàn bộ dữ liệu App Control của người dùng' })
  deleteAllData(@Req() request: AuthenticatedRequest) {
    return this.appControlService.deleteAllData(request.user.sub);
  }
}
