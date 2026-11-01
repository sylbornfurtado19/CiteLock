import assert from "node:assert";

/**
 * Calculates relative luminance according to WCAG 2.1 specifications:
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function hexToRgb(hex) {
  const cleanHex = hex.replace("#", "");
  const bigint = parseInt(cleanHex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function sRgbToLinear(c) {
  const val = c / 255;
  return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
}

function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * sRgbToLinear(r) +
    0.7152 * sRgbToLinear(g) +
    0.0722 * sRgbToLinear(b)
  );
}

function getContrastRatio(hex1, hex2) {
  const lum1 = getLuminance(hex1);
  const lum2 = getLuminance(hex2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

console.log("=== CiteLock Design System: WCAG Contrast Audit ===");

const CANVAS_BG = "#05020D";
const SURFACE_BG = "#100A1C";
const ELEVATED_BG = "#171025";

const TOKENS = {
  primaryText: "#F5F0FF",
  secondaryText: "#C4B7DB",
  mutedText: "#9E93B3",
  brandLight: "#C084FC",
  statusSuccess: "#34D399",
  statusWarning: "#FBBF24",
  statusError: "#FB7185",
  focusRing: "#C084FC",
};

// 1. Primary Text (#F5F0FF)
const primaryVsCanvas = getContrastRatio(TOKENS.primaryText, CANVAS_BG);
const primaryVsSurface = getContrastRatio(TOKENS.primaryText, SURFACE_BG);
console.log(`Primary Text (#F5F0FF):`);
console.log(`  vs Canvas (#05020D):  ${primaryVsCanvas.toFixed(2)}:1 (Target: >= 4.5:1)`);
console.log(`  vs Surface (#100A1C): ${primaryVsSurface.toFixed(2)}:1 (Target: >= 4.5:1)`);
assert.ok(primaryVsCanvas >= 7.0, "Primary text must pass WCAG AAA (>= 7:1)");
assert.ok(primaryVsSurface >= 7.0, "Primary text must pass WCAG AAA on surface");

// 2. Secondary Text (#C4B7DB)
const secondaryVsCanvas = getContrastRatio(TOKENS.secondaryText, CANVAS_BG);
const secondaryVsSurface = getContrastRatio(TOKENS.secondaryText, SURFACE_BG);
console.log(`\nSecondary Text (#C4B7DB):`);
console.log(`  vs Canvas (#05020D):  ${secondaryVsCanvas.toFixed(2)}:1 (Target: >= 4.5:1)`);
console.log(`  vs Surface (#100A1C): ${secondaryVsSurface.toFixed(2)}:1 (Target: >= 4.5:1)`);
assert.ok(secondaryVsCanvas >= 4.5, "Secondary text must pass WCAG AA (>= 4.5:1)");
assert.ok(secondaryVsSurface >= 4.5, "Secondary text must pass WCAG AA on surface");

// 3. Muted Text (#9E93B3)
const mutedVsCanvas = getContrastRatio(TOKENS.mutedText, CANVAS_BG);
const mutedVsSurface = getContrastRatio(TOKENS.mutedText, SURFACE_BG);
console.log(`\nMuted Text (#9E93B3):`);
console.log(`  vs Canvas (#05020D):  ${mutedVsCanvas.toFixed(2)}:1 (Target: >= 4.5:1)`);
console.log(`  vs Surface (#100A1C): ${mutedVsSurface.toFixed(2)}:1 (Target: >= 4.5:1)`);
assert.ok(mutedVsCanvas >= 4.5, "Muted text must pass WCAG AA (>= 4.5:1)");
assert.ok(mutedVsSurface >= 4.5, "Muted text must pass WCAG AA on surface");

// 4. Status Colors (Success, Warning, Error)
const successVsSurface = getContrastRatio(TOKENS.statusSuccess, SURFACE_BG);
const warningVsSurface = getContrastRatio(TOKENS.statusWarning, SURFACE_BG);
const errorVsSurface = getContrastRatio(TOKENS.statusError, SURFACE_BG);
console.log(`\nStatus Indicators vs Surface:`);
console.log(`  Success (#34D399): ${successVsSurface.toFixed(2)}:1 (Target: >= 4.5:1)`);
console.log(`  Warning (#FBBF24): ${warningVsSurface.toFixed(2)}:1 (Target: >= 4.5:1)`);
console.log(`  Error (#FB7185):   ${errorVsSurface.toFixed(2)}:1 (Target: >= 4.5:1)`);
assert.ok(successVsSurface >= 4.5, "Success text must pass WCAG AA");
assert.ok(warningVsSurface >= 4.5, "Warning text must pass WCAG AA");
assert.ok(errorVsSurface >= 4.5, "Error text must pass WCAG AA");

// 5. Accessible Focus Ring Indicator (#C084FC)
const focusVsCanvas = getContrastRatio(TOKENS.focusRing, CANVAS_BG);
console.log(`\nFocus Indicator Ring (#C084FC):`);
console.log(`  vs Canvas (#05020D): ${focusVsCanvas.toFixed(2)}:1 (WCAG 2.1 Criterion 2.4.11 Target: >= 3:1)`);
assert.ok(focusVsCanvas >= 3.0, "Focus indicator must exceed 3:1 against background");

console.log("\nALL 5 WCAG AA/AAA CONTRAST AUDIT CHECKS PASSED!");

