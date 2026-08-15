export const UNLOCK_OPTIONS = [
  { id: 'UNLOCK_5', minutes: 5, leafPointCost: 5 },
  { id: 'UNLOCK_15', minutes: 15, leafPointCost: 15 },
  { id: 'UNLOCK_30', minutes: 30, leafPointCost: 30 },
] as const;

export const UNLOCK_OPTION_IDS = UNLOCK_OPTIONS.map((option) => option.id);

export type UnlockOptionId = (typeof UNLOCK_OPTIONS)[number]['id'];

export function getUnlockOption(optionId: UnlockOptionId) {
  return UNLOCK_OPTIONS.find((option) => option.id === optionId)!;
}
