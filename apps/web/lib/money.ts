/**
 * Convert kobo (minor units) to Naira (major units).
 */
export function minorToNaira(minor: number): number {
  return minor / 100;
}

/**
 * Convert Naira (major units) to kobo (minor units).
 * Uses Math.round to prevent floating point drift (e.g. 1.05 * 100 = 105.00000000000001).
 */
export function nairaToMinor(naira: number): number {
  return Math.round(naira * 100);
}
