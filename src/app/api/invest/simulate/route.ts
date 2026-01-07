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
    const summary = formatMarketSummary({
      modelBlurb: narrative,
      unitsSold: clampedUnits,
      unitPriceUsd: invention.unitPriceUsd,
      grossRevenueUsd,
      payoutUsd,
    });

    return NextResponse.json({
      unitsSold: clampedUnits,
      narrative: summary,
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
- CRITICAL: Do NOT mention any specific dollar amounts, prices, valuations, or percentages in the narrative. The UI will show the numbers.

PRODUCT FACTS:
- Title: ${args.invention.title}
- Category: ${args.invention.category}
- Price (USD): ${args.invention.unitPriceUsd}
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
- EXACTLY 2 short sentences (no line breaks).
- NO headings, NO labels, NO bullet points.
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
      "The market made a sound. It was… complicated.",
  };
}

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function sanitizeBlurb(input: string): string {
  let s = String(input || "").trim();
  if (!s) return "";
  // Remove line breaks and header-y patterns just in case.
  s = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/^[a-z][a-z0-9 _-]{0,18}\s*:\s*\S+/i.test(line))
    .join(" ");
  s = s.replace(/\s+/g, " ").trim();

  // Remove explicit money/percent figures if the model included them anyway.
  // Examples: "$79", "$79.99", "79 dollars", "USD 79", "75%", "1,000,000"
  s = s
    .replace(/\$[\d,]+(?:\.\d+)?/g, "")
    .replace(/\bUSD\s*[\d,]+(?:\.\d+)?\b/gi, "")
    .replace(/\b[\d,]+(?:\.\d+)?\s*(dollars|bucks)\b/gi, "")
    .replace(/\b[\d,]+\s*%\b/g, "")
    .replace(/\b[\d,]{4,}\b/g, ""); // strip big raw numbers (sales counts etc.)
  s = s.replace(/\s+/g, " ").trim();

  // Keep only first 2 sentences.
  const sentences =
    s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
  return sentences.slice(0, 2).join(" ").trim();
}

function formatMarketSummary(args: {
  modelBlurb: string;
  unitsSold: number;
  unitPriceUsd: number;
  grossRevenueUsd: number;
  payoutUsd: number;
}): string {
  const blurb = sanitizeBlurb(args.modelBlurb) || "The market reacted. The details are… vivid.";
  const unitsLine = `Units sold: ${args.unitsSold.toLocaleString("en-US")} @ ${usdFmt.format(args.unitPriceUsd)}`;
  const revenueLine = `Product gross revenue: ${usdFmt.format(args.grossRevenueUsd)}`;
  const payoutLine = `Your payout: ${usdFmt.format(args.payoutUsd)}`;
  return [blurb, "", unitsLine, revenueLine, payoutLine].join("\n");
}


