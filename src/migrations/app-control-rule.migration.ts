import type { Model } from 'mongoose';

import type { AppControlRuleDocument } from '../app-control/schemas/app-control-rule.schema';

export async function removeLegacyAppControlRuleFields(
  ruleModel: Model<AppControlRuleDocument>,
): Promise<number> {
  const result = await ruleModel.collection.updateMany(
    {
      $or: [
        { dailyLimitMinutes: { $exists: true } },
        { activeDays: { $exists: true } },
        { startTime: { $exists: true } },
        { endTime: { $exists: true } },
      ],
    },
    {
      $unset: {
        dailyLimitMinutes: '',
        activeDays: '',
        startTime: '',
        endTime: '',
      },
    },
  );
  return result.modifiedCount;
}
