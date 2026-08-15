import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

import { PACKAGE_NAME_PATTERN } from './package-fields.dto';
import { UNLOCK_OPTION_IDS, type UnlockOptionId } from '../unlock-options';

export class CreateTemporaryUnlockDto {
  @ApiProperty({ example: 'com.example.social' })
  @IsString()
  @MaxLength(200)
  @Matches(PACKAGE_NAME_PATTERN)
  packageName!: string;

  @ApiProperty({ enum: UNLOCK_OPTION_IDS, example: 'UNLOCK_15' })
  @IsString()
  @IsIn(UNLOCK_OPTION_IDS)
  optionId!: UnlockOptionId;
}
