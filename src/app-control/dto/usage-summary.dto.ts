import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  IsISO8601,
  IsOptional,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PACKAGE_NAME_PATTERN } from './package-fields.dto';

export class AppUsageItemDto {
  @ApiProperty({ example: 'com.example.social' })
  @IsString()
  @MaxLength(200)
  @Matches(PACKAGE_NAME_PATTERN)
  packageName!: string;

  @ApiProperty({ example: 600, minimum: 0, maximum: 86400, required: false })
  @ValidateIf(
    (item: AppUsageItemDto) => item.totalTimeInForegroundMs === undefined,
  )
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  foregroundSeconds?: number;

  @ApiProperty({
    example: 3600000,
    minimum: 0,
    maximum: 86400000,
    required: false,
  })
  @ValidateIf((item: AppUsageItemDto) => item.foregroundSeconds === undefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400000)
  totalTimeInForegroundMs?: number;

  @ApiProperty({ example: '2026-08-14T08:00:00.000Z', required: false })
  @IsOptional()
  @IsISO8601()
  lastTimeUsed?: string;
}

export class UpsertUsageSummaryDto {
  @ApiProperty({ example: '2026-08-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: 3600, minimum: 0, maximum: 86400, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  totalScreenTimeSeconds?: number;

  @ApiProperty({ type: [AppUsageItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AppUsageItemDto)
  apps!: AppUsageItemDto[];
}
