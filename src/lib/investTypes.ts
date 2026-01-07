import type { GameMode } from "@/lib/types";

export type InventionId = "A" | "B" | "C";

export type Invention = {
  id: InventionId;
  title: string;
  pitch: string; // inventor's original pitch
  descriptors: [string, string];

  // Economics
  valuationUsd: number; // determines ownershipShare
  unitPriceUsd: number;
  unitCogsUsd: number; // narrative grounding (not used for payout)

  category: string;
  imageUrl?: string; // public URL (Blob) or data URL (local dev)
};

export type HiddenInventionTruth = {
  notes: string; // freeform hidden rationale + constraints
  regulatoryRisk: "low" | "medium" | "high";
  demandProfile: "niche" | "mainstream" | "enterprise" | "fad";
};

export type InvestSlate = {
  version: 1;
  dateKey?: string; // daily only
  gameId: string; // daily: equals dateKey; random: uuid
  mode: GameMode;
  inventions: [Invention, Invention, Invention];
  hidden: Record<InventionId, HiddenInventionTruth>;
};

export type InvestSimResult = {
  unitsSold: number; // 1..1_000_000, clamped server-side
  grossRevenueUsd: number;
  ownershipShare: number; // 0..0.75
  payoutUsd: number; // grossRevenueUsd * ownershipShare
  narrative: string;
};

export type ClientInvestDayState = {
  version: 1;
  mode: GameMode;
  dateKey: string;
  gameId: string;
  startedAt: number;

  inventions: [Invention, Invention, Invention]; // cached for UI display
  selectedInventionId?: InventionId;

  suggestion?: string;
  revisedPitch?: string;
  investedUsd?: number;
  ownershipShare?: number; // derived from investedUsd / valuationUsd (capped)

  isComplete: boolean;
  sim?: InvestSimResult;
};

export type ClientBankrollState = {
  version: 1;
  bankrollUsd: number;
  lastSeenDateKey?: string;
};


