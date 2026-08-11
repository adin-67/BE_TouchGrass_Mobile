import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum StatisticsPeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class StatisticsQueryDto {
  @ApiPropertyOptional({
    enum: StatisticsPeriod,
    default: StatisticsPeriod.WEEK,
  })
  @IsEnum(StatisticsPeriod)
  @IsOptional()
  period: StatisticsPeriod = StatisticsPeriod.WEEK;
}
