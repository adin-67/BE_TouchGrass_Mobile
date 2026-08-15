import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAppControlRuleDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}
