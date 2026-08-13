import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TemporaryUnlockStatus } from '../schemas/temporary-unlock-session.schema';

export class AppControlRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() packageName!: string;
  @ApiProperty() appName!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() dailyLimitMinutes!: number;
  @ApiProperty({ type: [Number] }) activeDays!: number[];
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AppControlRuleListResponseDto {
  @ApiProperty({ type: [AppControlRuleResponseDto] })
  items!: AppControlRuleResponseDto[];
}

export class AllowlistResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() packageName!: string;
  @ApiProperty() appName!: string;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
}

export class AllowlistListResponseDto {
  @ApiProperty({ type: [AllowlistResponseDto] })
  items!: AllowlistResponseDto[];
}

export class UnlockResponseDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty() packageName!: string;
  @ApiProperty() startedAt!: Date;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() minutesSpent!: number;
  @ApiProperty({ enum: TemporaryUnlockStatus }) status!: TemporaryUnlockStatus;
  @ApiProperty() remainingBalance!: number;
  @ApiProperty() alreadyProcessed!: boolean;
}

export class UnlockStatusResponseDto {
  @ApiProperty() active!: boolean;
  @ApiPropertyOptional({ nullable: true }) expiresAt!: Date | null;
  @ApiProperty() remainingSeconds!: number;
}

export class UsageSummaryResponseDto {
  @ApiProperty() available!: boolean;
  @ApiPropertyOptional({ nullable: true }) date!: string | null;
  @ApiPropertyOptional({ nullable: true }) totalScreenTimeSeconds!:
    number | null;
  @ApiProperty() limitedAppCount!: number;
  @ApiProperty() timeSavedAvailable!: boolean;
  @ApiPropertyOptional({ nullable: true }) timeSavedSeconds!: number | null;
}

export class UsageSummaryAppResponseDto {
  @ApiProperty() packageName!: string;
  @ApiProperty() foregroundSeconds!: number;
}

export class UsageSummaryRecordResponseDto {
  @ApiProperty() date!: string;
  @ApiProperty() totalScreenTimeSeconds!: number;
  @ApiProperty({ type: [UsageSummaryAppResponseDto] })
  apps!: UsageSummaryAppResponseDto[];
  @ApiProperty() updatedAt!: Date;
}
