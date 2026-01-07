import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON, kvSetJSON } from "@/lib/storage";
import { investSlateKeyFor } from "@/lib/investKeys";
import { pickDescriptors } from "@/lib/descriptors";
import { hash32 } from "@/lib/hash";
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

    // Pre-pick distinct price + valuation targets for the slate to encourage variety.
    // Unit price uses explicit bands (requested):
    // - low: 5–50
    // - mid: 100–500
    // - high: 1000–3000
    // We pass these into the prompt so the model can build products appropriate to the numbers.
    const priceTargets = pickTripletFromBuckets({
      seed: `${seed}:unitPrice`,
      buckets: [
        [5, 50],
        [100, 500],
        [1000, 3000],
      ],
    });
    const valuationTargets = makeVariedNumberTriplet({
      seed: `${seed}:valuation`,
      min: INVEST_VALUATION_MIN_USD,
      max: INVEST_VALUATION_MAX_USD,
    });

    for (const id of ids) {
      const descriptors = pickDescriptors({
        seed: `${seed}:${id}`,
        count: 2,
        avoidNormalized: avoid,
      });
      for (const d of descriptors) avoid.add(d.trim().toLowerCase());

      const idx = id === "A" ? 0 : id === "B" ? 1 : 2;
      const unitPriceUsd = Math.max(INVEST_UNIT_PRICE_MIN_USD, Math.min(INVEST_UNIT_PRICE_MAX_USD, priceTargets[idx]!));
      const valuationUsd = Math.max(INVEST_VALUATION_MIN_USD, Math.min(INVEST_VALUATION_MAX_USD, valuationTargets[idx]!));

      const generated = await generateInvention({
        seed: `${seed}:${id}`,
        id,
        descriptors: [descriptors[0] || "consumer annoyance", descriptors[1] || "bureaucratic form"],
        fixedNumbers: { valuationUsd, unitPriceUsd },
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
  fixedNumbers: { valuationUsd: number; unitPriceUsd: number };
}): Promise<{ invention: Invention; hidden: HiddenInventionTruth }> {
  const openai = getOpenAIClient();
  const prompt = buildInventionPrompt(args.seed, args.id, args.descriptors, args.fixedNumbers);
  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL_ID,
    messages: [{ role: "system", content: prompt }],
    max_completion_tokens: 900,
    reasoning_effort: DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
    verbosity: "low",
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  return parseInventionResponse(raw, args.id, args.descriptors, args.fixedNumbers);
}

function buildInventionPrompt(
  seed: string,
  id: InventionId,
  descriptors: [string, string],
  fixedNumbers: { valuationUsd: number; unitPriceUsd: number },
): string {
  const [d1, d2] = descriptors;
  const { valuationUsd, unitPriceUsd } = fixedNumbers;
  return `You are generating one invention pitch for a comedic daily investor game called "High Stakes".

SEED (for determinism cues only): ${seed}
SLOT ID: ${id}
MANDATORY DESCRIPTORS (must strongly shape the invention): ${d1} + ${d2}
FIXED BUSINESS NUMBERS (these are given facts about the product):
- valuationUsd: ${valuationUsd}
- unitPriceUsd: ${unitPriceUsd}

OUTPUT REQUIREMENTS:
- Respond ONLY with strict JSON (no extra text).
- JSON shape:
{
  "invention": {
    "title": string,
    "pitch": string,
    "category": string
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
- CRITICAL: Do NOT mention valuation, price, dollars, or any specific numbers in the pitch. The UI will show those.
- The product title MUST be novel, catchy, and relevant to the invention.
- CRITICAL: The title MUST NOT contain either descriptor phrase or any descriptor words.
  - Do NOT include words from: "${d1}" or "${d2}" in the title.

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
  fixedNumbers: { valuationUsd: number; unitPriceUsd: number },
): { invention: Invention; hidden: HiddenInventionTruth } {
  try {
    const parsed = JSON.parse(raw) as any;
    const inv = parsed?.invention ?? {};
    const hid = parsed?.hidden ?? {};

    // We pre-select and enforce these numbers for variety across the slate.
    const unitPriceUsd = clampInt(
      fixedNumbers.unitPriceUsd,
      INVEST_UNIT_PRICE_MIN_USD,
      INVEST_UNIT_PRICE_MAX_USD,
    );
    const valuationUsd = clampInt(
      fixedNumbers.valuationUsd,
      INVEST_VALUATION_MIN_USD,
      INVEST_VALUATION_MAX_USD,
    );

    const invention: Invention = {
      id,
      title: sanitizeTitle(String(inv.title || `Invention ${id}`).trim(), descriptors, `${id}:${unitPriceUsd}:${valuationUsd}`),
      pitch: sanitizePitch(String(inv.pitch || "").trim()) || "A pitch so secret it forgot to show up.",
      category: String(inv.category || "consumer").trim() || "consumer",
      descriptors,
      valuationUsd,
      unitPriceUsd,
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
        title: fallbackTitle(descriptors, `${id}:fallback`),
        pitch: "A pitch so secret it forgot to show up.",
        category: "consumer",
        descriptors,
        valuationUsd: fixedNumbers.valuationUsd,
        unitPriceUsd: fixedNumbers.unitPriceUsd,
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

function normalizeWord(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function descriptorBannedWords(descriptors: [string, string]): Set<string> {
  const out = new Set<string>();
  for (const d of descriptors) {
    const words = String(d || "")
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[^a-z0-9\s]+/g, " ")
      .split(/\s+/g)
      .map((w) => w.trim())
      .filter(Boolean);
    for (const w of words) {
      const norm = normalizeWord(w);
      if (!norm) continue;
      // Allow tiny glue-words; focus on meaningful tokens.
      if (norm.length < 3) continue;
      out.add(norm);
    }
  }
  return out;
}

function sanitizeTitle(title: string, descriptors: [string, string], seed: string): string {
  const banned = descriptorBannedWords(descriptors);
  let s = String(title || "").trim();
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/[+]/g, " ").replace(/\s+/g, " ").trim();

  // Remove any words that appear in descriptors.
  const words = s.split(/\s+/g).filter(Boolean);
  const kept = words.filter((w) => !banned.has(normalizeWord(w)));
  let cleaned = kept.join(" ").replace(/\s+/g, " ").trim();

  // If we stripped too much, fall back to deterministic catchy name.
  if (cleaned.length < 3 || cleaned.split(/\s+/g).length < 1) {
    cleaned = fallbackTitle(descriptors, seed);
  }
  return cleaned;
}

function fallbackTitle(_descriptors: [string, string], seed: string): string {
  // Deterministic, descriptor-agnostic naming so we never leak the descriptor words into the title.
  const a = [
    "Nimbus",
    "Beacon",
    "Copper",
    "Orbit",
    "Latch",
    "Kettle",
    "Quiver",
    "Sprocket",
    "Civic",
    "Pocket",
    "Velvet",
    "Signal",
    "Ribbon",
    "Rocket",
    "Gadget",
    "Honey",
    "Marble",
    "Crisp",
  ];
  const b = [
    "Buddy",
    "Pilot",
    "Switch",
    "Vault",
    "Compass",
    "Nudge",
    "Patch",
    "Dock",
    "Bloom",
    "Bridge",
    "Gauge",
    "Buddy",
    "Kit",
    "Loop",
    "Works",
    "Pro",
  ];
  const h = hash32(seed);
  const w1 = a[h % a.length]!;
  const w2 = b[(Math.imul(h, 2654435761) >>> 0) % b.length]!;
  return `${w1} ${w2}`;
}

function makeVariedNumberTriplet(args: {
  seed: string;
  min: number;
  max: number;
}): [number, number, number] {
  const range = Math.max(1, args.max - args.min);
  const third = Math.floor(range / 3);
  const buckets: Array<[number, number]> = [
    [args.min, args.min + third],
    [args.min + third + 1, args.min + 2 * third],
    [args.min + 2 * third + 1, args.max],
  ];

  const h = hash32(args.seed);
  const pickIn = (i: number) => {
    const [lo, hi] = buckets[i]!;
    const span = Math.max(1, hi - lo);
    return lo + (Math.imul(h ^ (i * 0x9e3779b9), 1103515245) >>> 0) % (span + 1);
  };

  return [pickIn(0), pickIn(1), pickIn(2)];
}

function pickTripletFromBuckets(args: {
  seed: string;
  buckets: Array<[number, number]>;
}): [number, number, number] {
  const buckets = args.buckets.slice(0, 3);
  while (buckets.length < 3) buckets.push(buckets[buckets.length - 1] ?? [0, 0]);

  const h = hash32(args.seed);
  const pickIn = (i: number) => {
    const [loRaw, hiRaw] = buckets[i]!;
    const lo = Math.min(loRaw, hiRaw);
    const hi = Math.max(loRaw, hiRaw);
    const span = Math.max(0, hi - lo);
    const n = (Math.imul(h ^ (i * 0x9e3779b9), 1103515245) >>> 0) % (span + 1);
    return lo + n;
  };

  return [pickIn(0), pickIn(1), pickIn(2)];
}


