import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON, kvSetJSON } from "@/lib/storage";
import { investSlateKeyFor } from "@/lib/investKeys";
import { pickDescriptors } from "@/lib/descriptors";
import {
  INVEST_INVENTIONS_PER_DAY,
  INVEST_UNIT_PRICE_MAX_USD,
  INVEST_UNIT_PRICE_MIN_USD,
  INVEST_VALUATION_MAX_USD,
  INVEST_VALUATION_MIN_USD,
} from "@/lib/constants";
import { generateAndStoreInventionImage, inventionImagesCanPersist, inventionImagesEnabled } from "@/lib/inventionImage";
import type { GameMode } from "@/lib/types";
import type { HiddenInventionTruth, Invention, InventionId, InvestSlate } from "@/lib/investTypes";

export const runtime = "nodejs";

type StartRequest = {
  mode?: GameMode;
  dateKey?: string; // required for daily
};

type StartResponse = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  inventions: [Invention, Invention, Invention];
};

const DAILY_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const RANDOM_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StartRequest;
    const mode: GameMode = body.mode === "debug-random" ? "debug-random" : "daily";
    if (mode === "daily" && !body.dateKey) {
      return NextResponse.json({ error: "Missing dateKey for daily mode" }, { status: 400 });
    }

    const dateKey = (body.dateKey || "debug").trim();
    const gameId = mode === "daily" ? dateKey : randomUUID();
    const seed = mode === "daily" ? dateKey : gameId;

    const key = investSlateKeyFor(mode, gameId, mode === "daily" ? dateKey : undefined);
    const existing = await kvGetJSON<InvestSlate>(key);
    if (existing && existing.inventions?.length === 3) {
      // Ensure images exist if enabled; avoid storing data URLs in KV.
      const canPersist = inventionImagesCanPersist();
      const inventions = [...existing.inventions] as [Invention, Invention, Invention];
      if (inventionImagesEnabled()) {
        for (let i = 0; i < inventions.length; i++) {
          const inv = inventions[i]!;
          const needsImage = !inv.imageUrl || !canPersist;
          if (!needsImage) continue;
          try {
            const imageUrl = await generateAndStoreInventionImage({
              seed: `${seed}:${inv.id}`,
              gameId: existing.gameId,
              inventionId: inv.id,
              invention: inv,
            });
            inventions[i] = { ...inv, imageUrl };
          } catch (e) {
            console.warn("Invention image generation failed (cached):", e);
          }
        }
      }

      // If we can't persist, do not write back the data URLs.
      if (!canPersist) {
        const inventionsForKv = inventions.map((inv) => ({ ...inv, imageUrl: undefined })) as any;
        const updated: InvestSlate = { ...existing, inventions: inventionsForKv };
        await kvSetJSON(key, updated, { exSeconds: mode === "daily" ? DAILY_TTL_SECONDS : RANDOM_TTL_SECONDS });
      }

      return NextResponse.json({
        mode,
        dateKey,
        gameId: existing.gameId,
        inventions,
      } satisfies StartResponse);
    }

    const ids: InventionId[] = ["A", "B", "C"];
    if (INVEST_INVENTIONS_PER_DAY !== 3) {
      // Safety: types assume 3 inventions; keep constant aligned.
      console.warn("INVEST_INVENTIONS_PER_DAY is not 3; current implementation assumes exactly 3.");
    }

    const avoid = new Set<string>();
    const inventions: Invention[] = [];
    const hidden: Record<InventionId, HiddenInventionTruth> = {
      A: { notes: "", regulatoryRisk: "low", demandProfile: "niche" },
      B: { notes: "", regulatoryRisk: "low", demandProfile: "niche" },
      C: { notes: "", regulatoryRisk: "low", demandProfile: "niche" },
    };

    for (const id of ids) {
      const descriptors = pickDescriptors({
        seed: `${seed}:${id}`,
        count: 2,
        avoidNormalized: avoid,
      });
      for (const d of descriptors) avoid.add(d.trim().toLowerCase());

      const generated = await generateInvention({
        seed: `${seed}:${id}`,
        id,
        descriptors: [descriptors[0] || "consumer annoyance", descriptors[1] || "bureaucratic form"],
      });

      inventions.push(generated.invention);
      hidden[id] = generated.hidden;
    }

    // images (optional)
    const canPersist = inventionImagesCanPersist();
    const inventionsForResponse: Invention[] = [];
    const inventionsForKv: Invention[] = [];
    for (const inv of inventions) {
      let imageUrl: string | undefined = undefined;
      if (inventionImagesEnabled()) {
        try {
          imageUrl = await generateAndStoreInventionImage({
            seed: `${seed}:${inv.id}`,
            gameId,
            inventionId: inv.id,
            invention: inv,
          });
        } catch (e) {
          console.warn("Invention image generation failed (new):", e);
        }
      }
      inventionsForResponse.push({ ...inv, imageUrl });
      inventionsForKv.push({ ...inv, imageUrl: canPersist ? imageUrl : undefined });
    }

    const slate: InvestSlate = {
      version: 1,
      mode,
      dateKey: mode === "daily" ? dateKey : undefined,
      gameId,
      inventions: inventionsForKv as [Invention, Invention, Invention],
      hidden,
    };

    await kvSetJSON(key, slate, { exSeconds: mode === "daily" ? DAILY_TTL_SECONDS : RANDOM_TTL_SECONDS });

    return NextResponse.json({
      mode,
      dateKey,
      gameId,
      inventions: inventionsForResponse as [Invention, Invention, Invention],
    } satisfies StartResponse);
  } catch (error) {
    console.error("Error in /api/invest/start:", error);
    return NextResponse.json({ error: "Failed to start invest game" }, { status: 500 });
  }
}

async function generateInvention(args: {
  seed: string;
  id: InventionId;
  descriptors: [string, string];
}): Promise<{ invention: Invention; hidden: HiddenInventionTruth }> {
  const openai = getOpenAIClient();
  const prompt = buildInventionPrompt(args.seed, args.id, args.descriptors);
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL_ID,
    messages: [{ role: "system", content: prompt }],
    max_completion_tokens: 900,
    reasoning_effort: DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
    verbosity: "low",
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  return parseInventionResponse(raw, args.id, args.descriptors);
}

function buildInventionPrompt(seed: string, id: InventionId, descriptors: [string, string]): string {
  const [d1, d2] = descriptors;
  return `You are generating one invention pitch for a comedic daily investor game called "High Stakes".

SEED (for determinism cues only): ${seed}
SLOT ID: ${id}
MANDATORY DESCRIPTORS (must strongly shape the invention): ${d1} + ${d2}

OUTPUT REQUIREMENTS:
- Respond ONLY with strict JSON (no extra text).
- JSON shape:
{
  "invention": {
    "title": string,
    "pitch": string,
    "category": string,
    "valuationUsd": number,
    "unitPriceUsd": number,
    "unitCogsUsd": number
  },
  "hidden": {
    "notes": string,
    "regulatoryRisk": "low"|"medium"|"high",
    "demandProfile": "niche"|"mainstream"|"enterprise"|"fad"
  }
}

CONTENT REQUIREMENTS:
- Comedic but plausible enough to simulate a market.
- The invention must make sense as a single product.
- The pitch MUST read like a founder speaking directly to the sharks on Shark Tank.
- The pitch MUST be EXACTLY 2 short sentences.
- Each sentence should be short (aim for <= 120 characters per sentence).
- NO headings, NO labels, NO bullet points, NO line breaks, NO "Hook:"/"Target:"/"Problem:" formats.
- Numbers MUST be within bounds:
  - valuationUsd: ${INVEST_VALUATION_MIN_USD}..${INVEST_VALUATION_MAX_USD}
  - unitPriceUsd: ${INVEST_UNIT_PRICE_MIN_USD}..${INVEST_UNIT_PRICE_MAX_USD}
  - unitCogsUsd: between 0 and unitPriceUsd (can be high).

IMPORTANT:
- Descriptors should suffuse the concept (not just name-dropped).
`.trim();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parseInventionResponse(
  raw: string,
  id: InventionId,
  descriptors: [string, string],
): { invention: Invention; hidden: HiddenInventionTruth } {
  try {
    const parsed = JSON.parse(raw) as any;
    const inv = parsed?.invention ?? {};
    const hid = parsed?.hidden ?? {};

    const unitPriceUsd = clampInt(Number(inv.unitPriceUsd), INVEST_UNIT_PRICE_MIN_USD, INVEST_UNIT_PRICE_MAX_USD);
    const unitCogsUsd = clampInt(Number(inv.unitCogsUsd), 0, unitPriceUsd);
    const valuationUsd = clampInt(Number(inv.valuationUsd), INVEST_VALUATION_MIN_USD, INVEST_VALUATION_MAX_USD);

    const invention: Invention = {
      id,
      title: String(inv.title || `Invention ${id}`).trim() || `Invention ${id}`,
      pitch: sanitizePitch(String(inv.pitch || "").trim()) || "A pitch so secret it forgot to show up.",
      category: String(inv.category || "consumer").trim() || "consumer",
      descriptors,
      valuationUsd,
      unitPriceUsd,
      unitCogsUsd,
      imageUrl: undefined,
    };

    const regulatoryRisk =
      hid.regulatoryRisk === "high" || hid.regulatoryRisk === "medium" || hid.regulatoryRisk === "low"
        ? (hid.regulatoryRisk as "low" | "medium" | "high")
        : "low";
    const demandProfile =
      hid.demandProfile === "niche" ||
      hid.demandProfile === "mainstream" ||
      hid.demandProfile === "enterprise" ||
      hid.demandProfile === "fad"
        ? (hid.demandProfile as "niche" | "mainstream" | "enterprise" | "fad")
        : "niche";

    const hidden: HiddenInventionTruth = {
      notes: String(hid.notes || "").trim(),
      regulatoryRisk,
      demandProfile,
    };

    return { invention, hidden };
  } catch {
    return {
      invention: {
        id,
        title: `Invention ${id}`,
        pitch: "A pitch so secret it forgot to show up.",
        category: "consumer",
        descriptors,
        valuationUsd: INVEST_VALUATION_MIN_USD,
        unitPriceUsd: Math.max(INVEST_UNIT_PRICE_MIN_USD, 25),
        unitCogsUsd: 10,
      },
      hidden: { notes: "", regulatoryRisk: "low", demandProfile: "niche" },
    };
  }
}

function sanitizePitch(input: string): string {
  let s = String(input || "").trim();
  if (!s) return "";

  // Remove header-y lines like "HOOK: ..." / "Target: ..." / "Problem: ..." etc.
  // Also strip leading bullet markers.
  s = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/^[a-z][a-z0-9 _-]{0,18}\s*:\s*\S+/i.test(line))
    .map((line) => line.replace(/^[-*•]+\s+/, ""))
    .join(" ");

  s = s.replace(/\s+/g, " ").trim();

  // Enforce EXACTLY 2 sentences (drop anything after the second sentence).
  const sentences =
    s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
  const capped = sentences.slice(0, 2).join(" ").trim();
  return capped;
}


