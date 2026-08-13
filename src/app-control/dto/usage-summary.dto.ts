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
  ValidateNested,
} from 'class-validator';

import { PACKAGE_NAME_PATTERN } from './package-fields.dto';

export class AppUsageItemDto {
  @ApiProperty({ example: 'com.example.social' })
  @IsString()
  @MaxLength(200)
  @Matches(PACKAGE_NAME_PATTERN)
  packageName!: string;

  @ApiProperty({ example: 600, minimum: 0, maximum: 86400 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  foregroundSeconds!: number;
}

export class UpsertUsageSummaryDto {
  @ApiProperty({ example: '2026-08-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiProperty({ example: 3600, minimum: 0, maximum: 86400 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86400)
  totalScreenTimeSeconds!: number;

  @ApiProperty({ type: [AppUsageItemDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AppUsageItemDto)
  apps!: AppUsageItemDto[];
}
