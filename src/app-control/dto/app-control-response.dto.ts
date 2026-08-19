import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AppControlRuleResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() packageName!: string;
  @ApiProperty() appName!: string;
  @ApiProperty() enabled!: boolean;
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
  @ApiProperty() id!: string;
  @ApiProperty() packageName!: string;
  @ApiProperty() minutes!: number;
  @ApiProperty() leafPointsSpent!: number;
  @ApiProperty() remainingLeafPoints!: number;
  @ApiProperty() startedAt!: Date;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty() alreadyProcessed!: boolean;
}

export class UnlockOptionResponseDto {
  @ApiProperty({ example: 'UNLOCK_15' }) id!: string;
  @ApiProperty({ example: 15 }) minutes!: number;
  @ApiProperty({ example: 15 }) leafPointCost!: number;
}

export class UnlockOptionsResponseDto {
  @ApiProperty({ type: [UnlockOptionResponseDto] })
  items!: UnlockOptionResponseDto[];
}

export class ProtectedPackagesResponseDto {
  @ApiProperty({
    type: [String],
    example: ['com.android.settings', 'com.touchgrassmobile'],
  })
  items!: string[];
}

export class UnlockStatusResponseDto {
  @ApiProperty() packageName!: string;
  @ApiProperty() unlocked!: boolean;
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
  @ApiProperty() totalTimeInForegroundMs!: number;
  @ApiPropertyOptional({ nullable: true }) lastTimeUsed!: Date | null;
}

export class UsageSummaryRecordResponseDto {
  @ApiProperty() date!: string;
  @ApiProperty() totalScreenTimeSeconds!: number;
  @ApiProperty({ type: [UsageSummaryAppResponseDto] })
  apps!: UsageSummaryAppResponseDto[];
  @ApiProperty() updatedAt!: Date;
}
