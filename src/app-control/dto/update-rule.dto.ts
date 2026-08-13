import { OmitType, PartialType } from '@nestjs/swagger';

import { CreateAppControlRuleDto } from './create-rule.dto';

export class UpdateAppControlRuleDto extends PartialType(
  OmitType(CreateAppControlRuleDto, ['packageName'] as const),
) {}
