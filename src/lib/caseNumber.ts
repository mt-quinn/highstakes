import { hash32 } from "@/lib/hash";

/**
 * Deterministic 4-digit case number (1000–9999) derived from a seed.
 * - Daily mode: seed should be the daily dateKey for global consistency.
 * - Random mode: seed should be the gameId for per-run consistency.
 */
export function caseNumberFromSeed(seed: string): number {
  const n = hash32(seed);
  return 1000 + (n % 9000);
}


