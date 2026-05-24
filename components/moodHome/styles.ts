// Barrel for the moodHome StyleSheet maps. The original single file exceeded
// 300 lines, so the four StyleSheet.create maps were split into dedicated
// files. The public import surface is unchanged: `app/(tabs)/mood.tsx` still
// imports `styles`, `customSheetStyles`, `swStyles`, `pickerStripStyles` from
// './styles'. The big `styles` map is reassembled here from two disjoint
// halves (stylesPart1 + stylesPart2) so no key is added, dropped, or renamed.
import { stylesPart1 } from './mood.styles.part1';
import { stylesPart2 } from './mood.styles.part2';

export const styles = { ...stylesPart1, ...stylesPart2 };

export { customSheetStyles } from './mood.styles.customSheet';
export { swStyles } from './mood.styles.sw';
export { pickerStripStyles } from './mood.styles.pickerStrip';
