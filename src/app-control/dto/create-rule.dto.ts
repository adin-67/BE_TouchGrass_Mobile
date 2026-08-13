import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  Matches,
  Max,
  Min,
} from 'class-validator';

import { PackageFieldsDto } from './package-fields.dto';

export class CreateAppControlRuleDto extends PackageFieldsDto {
  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  enabled: boolean = true;

  @ApiProperty({ example: 60, minimum: 1, maximum: 1440 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  dailyLimitMinutes!: number;

  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  activeDays!: number[];

  @ApiProperty({ example: '08:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @ApiProperty({ example: '22:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}
