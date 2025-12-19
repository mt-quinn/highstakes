"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DAILY_STORAGE_KEY, MAX_QUESTION_CHARS, MAX_QUESTIONS } from "@/lib/constants";
import { todayLocalDateKey } from "@/lib/dateKey";
import { godObviousQuestionWarning, isObviousAlignmentQuestion } from "@/lib/obviousQuestionGuard";
import type { ClientGameState, GameMode, QAItem } from "@/lib/types";

type StartResponse = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  visible: {
    name: string;
    age: number;
    occupation: string;
    causeOfDeath: string;
  };
  faceEmoji: string;
};

type AskResponse = { answer?: string; blocked?: boolean; godMessage?: string };
type JudgeResponse = { correct: boolean; godMessage: string };

function reviveState(raw: unknown): ClientGameState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as any;
  if (!v.dateKey || !v.gameId || !v.visible) return null;
  if (v.mode !== "daily" && v.mode !== "debug-random") return null;
  return v as ClientGameState;
}

function makeEmptyState(mode: GameMode, dateKey: string, gameId: string): ClientGameState {
  return {
    mode,
    dateKey,
    gameId,
    startedAt: Date.now(),
    visible: {
      name: "",
      age: 0,
      occupation: "",
      causeOfDeath: "",
      faceEmoji: "🙂",
    },
    qa: [],
    isComplete: false,
  };
}

export function usePearlyGatesGame() {
  const todayKey = useMemo(() => todayLocalDateKey(), []);
  const [state, setState] = useState<ClientGameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [judging, setJudging] = useState(false);

  // load localStorage
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DAILY_STORAGE_KEY);
      if (stored) {
        const revived = reviveState(JSON.parse(stored));
        if (revived && revived.mode === "daily" && revived.dateKey === todayKey) {
          setState(revived);
          setLoading(false);
          return;
        }
      }
    } catch {
      // ignore
    }
    // fresh daily
    setState(makeEmptyState("daily", todayKey, todayKey));
    setLoading(false);
  }, [todayKey]);

  // persist localStorage
  useEffect(() => {
    if (!state) return;
    try {
      window.localStorage.setItem(DAILY_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const hasProfile = Boolean(
    state?.visible?.name &&
      state.visible.occupation &&
      state.visible.causeOfDeath,
  );

  const start = useCallback(
    async (mode: GameMode) => {
      const dateKey = todayKey;
      setError(null);
      const res = await fetch("/api/game/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, dateKey }),
      });
      if (!res.ok) throw new Error("start failed");
      const data = (await res.json()) as StartResponse;
      setState((prev) => {
        const next = makeEmptyState(data.mode, data.dateKey, data.gameId);
        next.visible = { ...data.visible, faceEmoji: data.faceEmoji };
        // If we were restarting within the same mode/day, keep completion state only if it matches.
        if (prev && prev.mode === data.mode && prev.dateKey === data.dateKey && prev.isComplete) {
          return prev;
        }
        return next;
      });
    },
    [todayKey],
  );

  // Ensure the daily profile exists / is loaded
  useEffect(() => {
    if (!state) return;
    if (state.isComplete) return;
    if (hasProfile) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await start(state.mode);
      } catch (e) {
        if (!cancelled) setError("Could not start today's game. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state, hasProfile, start]);

  const resetDaily = useCallback(() => {
    setState(makeEmptyState("daily", todayKey, todayKey));
  }, [todayKey]);

  const startRandom = useCallback(async () => {
    try {
      setLoading(true);
      await start("debug-random");
    } catch {
      setError("Could not start a random game. Try again.");
    } finally {
      setLoading(false);
    }
  }, [start]);

  const ask = useCallback(
    async (question: string) => {
      if (!state || state.isComplete) return;
      const trimmed = question.trim();
      if (!trimmed) return;
      if (trimmed.length > MAX_QUESTION_CHARS) {
        setError(`Question must be ${MAX_QUESTION_CHARS} characters or fewer.`);
        return;
      }
      const askedSoFar = state.qa.filter((x) => (x.from || "SOUL") === "SOUL").length;
      if (askedSoFar >= MAX_QUESTIONS) {
        setError("No questions remaining.");
        return;
      }

      setError(null);
      setAsking(true);
      try {
        // Client-side fast path so we don't spend tokens on obvious questions.
        if (isObviousAlignmentQuestion(trimmed)) {
          const item: QAItem = {
            q: trimmed,
            a: godObviousQuestionWarning(),
            from: "GOD",
          };
          setState((prev) => (prev ? { ...prev, qa: [...prev.qa, item] } : prev));
          return;
        }

        const res = await fetch("/api/game/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: state.mode,
            dateKey: state.dateKey,
            gameId: state.gameId,
            question: trimmed,
            qaSoFar: state.qa.filter((x) => (x.from || "SOUL") === "SOUL"),
          }),
        });
        if (!res.ok) throw new Error("ask failed");
        const data = (await res.json()) as AskResponse;
        if (data.blocked) {
          const item: QAItem = {
            q: trimmed,
            a: (data.godMessage || godObviousQuestionWarning()).toString(),
            from: "GOD",
          };
          setState((prev) => (prev ? { ...prev, qa: [...prev.qa, item] } : prev));
        } else {
          const a = (data.answer || "").toString();
          const item: QAItem = { q: trimmed, a, from: "SOUL" };
          setState((prev) => (prev ? { ...prev, qa: [...prev.qa, item] } : prev));
        }
      } catch {
        setError("Could not get an answer. Try again.");
      } finally {
        setAsking(false);
      }
    },
    [state],
  );

  const judge = useCallback(
    async (judgment: "HEAVEN" | "HELL") => {
      if (!state || state.isComplete) return;
      setJudging(true);
      setError(null);
      // lock immediately (no undo)
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, isComplete: true, judgment };
      });
      try {
        const res = await fetch("/api/game/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: state.mode,
            dateKey: state.dateKey,
            gameId: state.gameId,
            judgment,
            qa: state.qa,
          }),
        });
        if (!res.ok) throw new Error("judge failed");
        const data = (await res.json()) as JudgeResponse;
        setState((prev) => {
          if (!prev) return prev;
          return { ...prev, wasCorrect: !!data.correct, godMessage: data.godMessage || "" };
        });
      } catch {
        setError("Judgment recorded, but God is busy. Tap to retry the verdict.");
      } finally {
        setJudging(false);
      }
    },
    [state],
  );

  const retryVerdict = useCallback(async () => {
    if (!state || !state.isComplete || !state.judgment) return;
    if (state.godMessage) return;
    setJudging(true);
    setError(null);
    try {
      const res = await fetch("/api/game/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: state.mode,
          dateKey: state.dateKey,
          gameId: state.gameId,
          judgment: state.judgment,
          qa: state.qa,
        }),
      });
      if (!res.ok) throw new Error("judge failed");
      const data = (await res.json()) as JudgeResponse;
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, wasCorrect: !!data.correct, godMessage: data.godMessage || "" };
      });
    } catch {
      setError("Still no verdict. Try again in a moment.");
    } finally {
      setJudging(false);
    }
  }, [state]);

  return {
    state,
    isLoaded: !loading && !!state,
    loading,
    error,
    asking,
    judging,
    resetDaily,
    startRandom,
    ask,
    judge,
    retryVerdict,
    todayKey,
  } as const;
}


