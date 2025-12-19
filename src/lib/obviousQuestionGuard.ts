/**
 * Heuristics to block "obvious" alignment questions like:
 * - "are you good/evil?"
 * - "do you belong in heaven/hell?"
 * - "should I send you to heaven/hell?"
 *
 * We keep this intentionally conservative and focused on direct asks;
 * clever/deductive questions should still pass.
 */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isObviousAlignmentQuestion(question: string): boolean {
  const q = normalize(question);
  if (!q) return false;

  // Direct "are you good/evil" variants
  const directGoodEvil =
    /\b(are|r|were|am|is|would you say you are|tell me if you are)\b.*\b(you|u)\b.*\b(good|evil)\b/.test(q) ||
    /\b(are|r)\b.*\b(you|u)\b.*\b(a )?(good|evil)\b(\s+(person|soul|guy|man|woman))?\b/.test(q);

  // "Are you going to heaven/hell" or "do you belong in heaven/hell"
  const heavenHellBelong =
    /\b(do|did|would|should|are|r|will)\b.*\b(you|u)\b.*\b(belong|go|going|headed|destined)\b.*\b(heaven|hell)\b/.test(
      q,
    ) ||
    /\b(heaven|hell)\b.*\b(for you|for u|your place)\b/.test(q);

  // "Should I send/stamp you to heaven/hell"
  const shouldISend =
    /\bshould\b.*\b(i)\b.*\b(send|stamp|put|throw|cast|banish)\b.*\b(you|u)\b.*\b(to )?\b(heaven|hell)\b/.test(q) ||
    /\bwhich\b.*\b(heaven|hell)\b.*\b(you|u)\b/.test(q);

  // Explicit alignment words
  const alignmentWords =
    /\b(are you)\b.*\b(saint|monster|villain|angel|devil|demon)\b/.test(q) ||
    /\b(are you)\b.*\b(saved|damned)\b/.test(q);

  return directGoodEvil || heavenHellBelong || shouldISend || alignmentWords;
}

export function godObviousQuestionWarning(): string {
  return [
    "NO, MORTAL.",
    "PASSING JUDGMENT CANNOT BE THAT SIMPLE.",
    "ASK BETTER QUESTIONS. LISTEN CLOSELY.",
  ].join("\n");
}


