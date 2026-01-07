import type { GameMode } from "@/lib/types";

export function investDailySlateKey(dateKey: string): string {
  return `inv:daily:${dateKey}`;
}

export function investRandomSlateKey(gameId: string): string {
  return `inv:random:${gameId}`;
}

export function investSlateKeyFor(mode: GameMode, gameId: string, dateKey?: string): string {
  if (mode === "daily") {
    if (!dateKey) throw new Error("dateKey is required for daily invest slate lookup");
    return investDailySlateKey(dateKey);
  }
  return investRandomSlateKey(gameId);
}


