import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum HistoryFilter {
  ALL = 'all',
  DONE = 'done',
  INVALID = 'invalid',
  CANCELLED = 'cancelled',
}

export class HistoryQueryDto {
  @ApiPropertyOptional({
    enum: HistoryFilter,
    default: HistoryFilter.ALL,
  })
  @IsEnum(HistoryFilter)
  @IsOptional()
  filter: HistoryFilter = HistoryFilter.ALL;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 20;
}
