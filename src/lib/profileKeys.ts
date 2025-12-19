import type { GameMode } from "@/lib/types";

export function dailyProfileKey(dateKey: string): string {
  return `pg:daily:${dateKey}`;
}

export function randomProfileKey(gameId: string): string {
  return `pg:random:${gameId}`;
}

export function profileKeyFor(mode: GameMode, gameId: string, dateKey?: string): string {
  if (mode === "daily") {
    if (!dateKey) throw new Error("dateKey is required for daily profile lookup");
    return dailyProfileKey(dateKey);
  }
  return randomProfileKey(gameId);
}


