import { NextResponse } from "next/server";

import { DEFAULT_MODEL_ID, getOpenAIClient } from "@/lib/openai";
import { kvGetJSON } from "@/lib/storage";
import { investSlateKeyFor } from "@/lib/investKeys";
import type { GameMode } from "@/lib/types";
import type { InvestSlate, InventionId } from "@/lib/investTypes";

export const runtime = "nodejs";

type ReviseRequest = {
  mode?: GameMode;
  gameId?: string;
  dateKey?: string; // required for daily
  inventionId?: InventionId;
  suggestion?: string;
};

type ErrorResponse = { error?: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReviseRequest;
    const mode: GameMode = body.mode === "debug-random" ? "debug-random" : "daily";
    const dateKey = (body.dateKey || "").trim();
    const gameId = (body.gameId || "").trim() || dateKey;
    const inventionId = body.inventionId;
    const suggestion = String(body.suggestion || "").trim();

    if (mode === "daily" && !dateKey) {
      return NextResponse.json({ error: "Missing dateKey for daily mode" }, { status: 400 });
    }
    if (!gameId) {
      return NextResponse.json({ error: "Missing gameId" }, { status: 400 });
    }
    if (inventionId !== "A" && inventionId !== "B" && inventionId !== "C") {
      return NextResponse.json({ error: "Missing inventionId" }, { status: 400 });
    }
    if (!suggestion) {
      return NextResponse.json({ error: "Missing suggestion" }, { status: 400 });
    }
    if (suggestion.length > 220) {
      return NextResponse.json({ error: "Suggestion too long" }, { status: 400 });
    }

    const key = investSlateKeyFor(mode, gameId, dateKey);
    const slate = await kvGetJSON<InvestSlate>(key);
    if (!slate) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }
    const invention = slate.inventions.find((x) => x.id === inventionId);
    if (!invention) {
      return NextResponse.json({ error: "Invention not found" }, { status: 404 });
    }

    const openai = getOpenAIClient();
    const prompt = buildRevisePrompt(invention.pitch, suggestion);
    const response = await openai.chat.completions.create({
      model: DEFAULT_MODEL_ID,
      messages: [{ role: "system", content: prompt }],
      max_completion_tokens: 420,
      reasoning_effort: DEFAULT_MODEL_ID === "gpt-5.2-2025-12-11" ? ("none" as any) : "minimal",
      verbosity: "low",
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const revisedPitch = parseRevisedPitch(raw);
    return NextResponse.json({ revisedPitch });
  } catch (error) {
    console.error("Error in /api/invest/revise:", error);
    return NextResponse.json({ error: "Failed to revise pitch" } satisfies ErrorResponse, { status: 500 });
  }
}

function buildRevisePrompt(originalPitch: string, suggestion: string): string {
  return `You are rewriting a comedic investor pitch.

RULES:
- Keep the same invention. Do not change what the product fundamentally is.
- Apply the player's suggestion. If the suggestion is nonsense, interpret it generously.
- Do NOT invent hard factual claims as if already achieved (no "we have 1M users" unless it was in the original).
- It's okay to add plans, positioning, and clearer value props.
- Keep it punchy and readable on mobile.
- Output MUST read like a founder speaking directly to the sharks on Shark Tank.
- Output MUST be EXACTLY 2 short sentences.
- Each sentence should be short (aim for <= 120 characters per sentence).
- NO headings, NO labels, NO bullet points, NO line breaks, NO "Hook:"/"Target:"/"Problem:" formats.

ORIGINAL PITCH:
${originalPitch}

PLAYER SUGGESTION:
${suggestion}

Respond ONLY with strict JSON in this exact shape:
{"revisedPitch":"string"}`.trim();
}

function parseRevisedPitch(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { revisedPitch?: unknown };
    if (typeof parsed.revisedPitch === "string" && parsed.revisedPitch.trim()) {
      return sanitizePitch(parsed.revisedPitch.trim());
    }
  } catch {
    // fall through
  }
  const m = raw.match(/"revisedPitch"\s*:\s*"([\s\S]*?)"/i);
  if (m && m[1]) return sanitizePitch(m[1].trim());
  return "We refined the pitch, but the words slipped through our fingers.\nTry again with a shorter suggestion.";
}

function sanitizePitch(input: string): string {
  let s = String(input || "").trim();
  if (!s) return "";

  s = s
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => !/^[a-z][a-z0-9 _-]{0,18}\s*:\s*\S+/i.test(line))
    .map((line) => line.replace(/^[-*•]+\s+/, ""))
    .join(" ");

  s = s.replace(/\s+/g, " ").trim();

  const sentences =
    s.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
  const capped = sentences.slice(0, 2).join(" ").trim();
  return capped;
}


