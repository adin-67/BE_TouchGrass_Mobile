import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

import { PackageFieldsDto } from './package-fields.dto';

export class CreateAppControlRuleDto extends PackageFieldsDto {
  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  enabled: boolean = true;
}
