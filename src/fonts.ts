// Loads the two typefaces the design system is built on: Sora (display,
// numerals, eyebrows) and Manrope (body/UI copy). Both ship as Expo Google
// Font packages, so the actual .ttf files never touch this repo.
//
// If loading fails for any reason (offline first launch, package not yet
// installed), every style in theme.ts falls back to the system font and
// still honors fontWeight — the app is fully usable either way, it just
// looks closest to the approved design once these are loaded.
import {
  useFonts,
  Sora_400Regular,
  Sora_500Medium,
  Sora_600SemiBold,
  Sora_700Bold,
  Sora_800ExtraBold,
} from '@expo-google-fonts/sora';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

export function useDesignSystemFonts() {
  return useFonts({
    Sora_400Regular,
    Sora_500Medium,
    Sora_600SemiBold,
    Sora_700Bold,
    Sora_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
}
