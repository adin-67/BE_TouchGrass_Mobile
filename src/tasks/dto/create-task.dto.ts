import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  TaskCategory,
  TaskDifficulty,
  TaskFrequency,
  TaskTargetUnit,
  TaskVerificationType,
} from '../schemas/task.schema';

export class CreateTaskDto {
  @ApiProperty({ example: 'WALK_IN_THE_PARK' })
  @IsString()
  @Matches(/^[A-Z0-9_]+$/)
  @MaxLength(50)
  code!: string;

  @ApiProperty({ example: 'Đi bộ trong công viên' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  title!: string;

  @ApiProperty({ example: 'Đi bộ ngoài trời đủ 500 mét.' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ enum: TaskCategory })
  @IsEnum(TaskCategory)
  category!: TaskCategory;

  @ApiProperty({ enum: TaskVerificationType })
  @IsEnum(TaskVerificationType)
  verificationType!: TaskVerificationType;

  @ApiPropertyOptional({ type: [String], example: ['Plant', 'Tree'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  verificationLabels?: string[];

  @ApiPropertyOptional({ default: 0.7, minimum: 0, maximum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  verificationMinConfidence?: number;

  @ApiProperty({ enum: TaskFrequency })
  @IsEnum(TaskFrequency)
  frequency!: TaskFrequency;

  @ApiProperty({ example: '🌿' })
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  emoji!: string;

  @ApiProperty({ enum: TaskDifficulty })
  @IsEnum(TaskDifficulty)
  difficulty!: TaskDifficulty;

  @ApiProperty({ example: 20, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rewardXp!: number;

  @ApiProperty({ example: 5, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  rewardLp!: number;

  @ApiProperty({ example: 5, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unlockMinutes!: number;

  @ApiProperty({ example: 500, minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  targetValue!: number;

  @ApiProperty({ enum: TaskTargetUnit })
  @IsEnum(TaskTargetUnit)
  targetUnit!: TaskTargetUnit;

  @ApiProperty({ example: 10, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes!: number;

  @ApiProperty({ type: [String], example: ['Bật GPS.', 'Đi bộ đủ 500 mét.'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  instructions!: string[];

  @ApiPropertyOptional({ example: '06:00', nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string | null;

  @ApiPropertyOptional({ example: '23:00', nullable: true })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
