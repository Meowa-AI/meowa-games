export const BATTLE_ENTRY_POKEBALL_ASSET =
  'assets/battle/transition/SPR_NewPokeball1.png';

export const BATTLE_ENTRY_RELEASE_FRAMES = Array.from(
  { length: 11 },
  (_, index) => `assets/battle/transition/SPR_Pokeball_Release${index + 1}.png`,
);

export function getCaptureOutcomeAsset(caught: boolean): string {
  return caught
    ? BATTLE_ENTRY_POKEBALL_ASSET
    : BATTLE_ENTRY_RELEASE_FRAMES[BATTLE_ENTRY_RELEASE_FRAMES.length - 1];
}
