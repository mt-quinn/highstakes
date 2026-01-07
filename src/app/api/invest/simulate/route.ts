import { NextResponse } from "next/server";

import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON } from "@/lib/storage";
import { investSlateKeyFor } from "@/lib/investKeys";
import {
  INVEST_MAX_INVEST_FRACTION_OF_VALUATION,
  INVEST_MAX_UNITS_SOLD,
  INVEST_MIN_UNITS_SOLD,
} from "@/lib/constants";
import type { GameMode } from "@/lib/types";
import type { InvestSlate, InventionId } from "@/lib/investTypes";

export const runtime = "nodejs";

type SimRequest = {
  mode?: GameMode;
  gameId?: string;
  dateKey?: string; // required for daily
  inventionId?: InventionId;
  revisedPitch?: string;
  investedUsd?: number;
};

type SimResponse = {
  unitsSold: number;
  narrative: string;
  grossRevenueUsd: number;
  ownershipShare: number;
  payoutUsd: number;
};

type ErrorResponse = { error?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SimRequest;
    const mode: GameMode = body.mode === "debug-random" ? "debug-random" : "daily";
    const dateKey = (body.dateKey || "").trim();
    const gameId = (body.gameId || "").trim() || dateKey;
    const inventionId = body.inventionId;
    const revisedPitch = String(body.revisedPitch || "").trim();
    const investedUsdRaw = Number(body.investedUsd);

    if (mode === "daily" && !dateKey) {
      return NextResponse.json({ error: "Missing dateKey for daily mode" }, { status: 400 });
    }
    if (!gameId) {
      return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
    }
    if (inventionId !== "A" && inventionId !== "B" && inventionId !== "C") {
      return NextResponse.json({ error: "Missing inventionId" }, { status: 400 });
    }
    if (!revisedPitch) {
      return NextResponse.json({ error: "Missing revisedPitch" }, { status: 400 });
    }
    if (!Number.isFinite(investedUsdRaw) || investedUsdRaw <= 0) {
      return NextResponse.json({ error: "Invalid investedUsd" }, { status: 400 });
    }

    const key = investSlateKeyFor(mode, gameId, dateKey);
    const slate = await kvGetJSON<InvestSlate>(key);
    if (!slate) {
      return NextResponse.json({ error: "Game not found" } satisfies ErrorResponse, { status: 404 });
    }
    const invention = slate.inventions.find((x) => x.id === inventionId);
    if (!invention) {
      return NextResponse.json({ error: "Invention not found" } satisfies ErrorResponse, { status: 404 });
    }

    const maxInvest = Math.floor(invention.valuationUsd * INVEST_MAX_INVEST_FRACTION_OF_VALUATION);
    const investedUsd = Math.min(Math.floor(investedUsdRaw), maxInvest);
    if (investedUsd <= 0) {
      return NextResponse.json({ error: "Investment is too small" } satisfies ErrorResponse, { status: 400 });
    }

    const ownershipShare = Math.min(INVEST_MAX_INVEST_FRACTION_OF_VALUATION, investedUsd / invention.valuationUsd);

    const openai = getOpenAIClient();
    const prompt = buildSimPrompt({
      invention,
      hidden: slate.hidden[inventionId],
      revisedPitch,
    });
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL_ID,
      messages: [{ role: "system", content: prompt }],
      max_completion_tokens: 900,
      reasoning_effort: DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
      verbosity: "low",
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const { unitsSold, narrative } = parseSimResponse(raw);

    const clampedUnits = clampInt(unitsSold, INVEST_MIN_UNITS_SOLD, INVEST_MAX_UNITS_SOLD);
    const grossRevenueUsd = clampedUnits * invention.unitPriceUsd;
    const payoutUsd = Math.round(grossRevenueUsd * ownershipShare);

    return NextResponse.json({
      unitsSold: clampedUnits,
      narrative,
      grossRevenueUsd,
      ownershipShare,
      payoutUsd,
    } satisfies SimResponse);
  } catch (error) {
    console.error("Error in /api/invest/simulate:", error);
    return NextResponse.json({ error: "Failed to simulate market" } satisfies ErrorResponse, { status: 500 });
  }
}

function buildSimPrompt(args: {
  invention: {
    title: string;
    pitch: string;
    descriptors: [string, string];
    valuationUsd: number;
    unitPriceUsd: number;
    unitCogsUsd: number;
    category: string;
  };
  hidden: {
    notes: string;
    regulatoryRisk: "low" | "medium" | "high";
    demandProfile: "niche" | "mainstream" | "enterprise" | "fad";
  };
  revisedPitch: string;
}): string {
  const [d1, d2] = args.invention.descriptors;
  return `You are a comedic MARKET SIMULATOR for a daily investor game called "High Stakes".

Your job: narrate what happens when this product hits the market AND output a plausible unitsSold count.

HARD RULES:
- The player payout is based on GROSS REVENUE ONLY (unitsSold * unitPriceUsd). Do not mention profit share.
- You must output unitsSold as an integer in the range ${INVEST_MIN_UNITS_SOLD}..${INVEST_MAX_UNITS_SOLD}.
- The narrative should justify the scale of unitsSold (why so many / why so few).
- Keep it funny, but make it causally coherent: product -> marketing -> consumer reaction -> consequences.
- If you introduce new facts, frame them as market events that occurred, not things the player already knew.

PRODUCT FACTS:
- Title: ${args.invention.title}
- Category: ${args.invention.category}
- Price (USD): ${args.invention.unitPriceUsd}
- COGS (USD, for realism only): ${args.invention.unitCogsUsd}
- Valuation (USD): ${args.invention.valuationUsd}
- Descriptors (must be felt in the story): ${d1} + ${d2}

ORIGINAL PITCH:
${args.invention.pitch}

REVISED PITCH (what shipped to market):
${args.revisedPitch}

HIDDEN MARKET TRUTH (for you only; do not dump as a list, use it to steer outcomes):
- Regulatory risk: ${args.hidden.regulatoryRisk}
- Demand profile: ${args.hidden.demandProfile}
- Notes: ${args.hidden.notes || "(none)"}

OUTPUT FORMAT:
Respond ONLY with strict JSON in this exact shape:
{"unitsSold": number, "narrative": "string"}

NARRATIVE FORMAT:
- A 5-9 sentence characterful narrative from an unaffiliated Market Analyst giving the day's news.
`.trim();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseSimResponse(raw: string): { unitsSold: number; narrative: string } {
  try {
    const parsed = JSON.parse(raw) as any;
    const unitsSold = Number(parsed?.unitsSold);
    const narrative = String(parsed?.narrative || "").trim();
    if (Number.isFinite(unitsSold) && narrative) return { unitsSold, narrative };
  } catch {
    // fall through
  }
  const unitsMatch = raw.match(/"unitsSold"\s*:\s*([0-9]+)/i);
  const narMatch = raw.match(/"narrative"\s*:\s*"([\s\S]*?)"/i);
  return {
    unitsSold: unitsMatch ? Number(unitsMatch[1]) : 1,
    narrative:
      (narMatch && narMatch[1] ? narMatch[1].trim() : "") ||
      "THE MARKET SPOKE.\nIT WAS MOSTLY COUGHING.\n(TRY AGAIN TOMORROW.)",
  };
}


