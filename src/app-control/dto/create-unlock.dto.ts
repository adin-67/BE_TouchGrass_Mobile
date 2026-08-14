import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { PACKAGE_NAME_PATTERN } from './package-fields.dto';

export class CreateTemporaryUnlockDto {
  @ApiProperty({ example: 'com.example.social' })
  @IsString()
  @MaxLength(200)
  @Matches(PACKAGE_NAME_PATTERN)
  packageName!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 1440 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number;

  @ApiProperty({ example: '66b9f2bc7d9d151a1b5d1234' })
  @IsMongoId()
  sourceUserTaskId!: string;
}
