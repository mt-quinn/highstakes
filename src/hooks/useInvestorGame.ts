"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  INVEST_BANKROLL_FLOOR_USD,
  INVEST_BANKROLL_STORAGE_KEY,
  INVEST_DAY_STORAGE_KEY,
  INVEST_MAX_INVEST_FRACTION_OF_VALUATION,
  INVEST_STARTING_BANKROLL_USD,
} from "@/lib/constants";
import { todayInvestDateKey } from "@/lib/investDateKey";
import type { ClientBankrollState, ClientInvestDayState, InventionId, InvestSimResult } from "@/lib/investTypes";
import type { GameMode } from "@/lib/types";

type StartResponse = {
  mode: GameMode;
  dateKey: string;
  gameId: string;
  inventions: ClientInvestDayState["inventions"];
};

type ReviseResponse = { revisedPitch?: string };

type SimResponse = {
  unitsSold: number;
  narrative: string;
  grossRevenueUsd: number;
  ownershipShare: number;
  payoutUsd: number;
};

type ErrorResponse = { error?: string };

function reviveDayState(raw: unknown): ClientInvestDayState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as any;
  if (!v.dateKey || !v.gameId || !Array.isArray(v.inventions) || v.inventions.length !== 3) return null;
  if (v.mode !== "daily" && v.mode !== "debug-random") return null;
  return v as ClientInvestDayState;
}

function makeEmptyDayState(mode: GameMode, dateKey: string, gameId: string): ClientInvestDayState {
  // placeholder inventions; real ones load from /api/invest/start
  const blankInv: any = {
    id: "A",
    title: "",
    pitch: "",
    descriptors: ["", ""],
    valuationUsd: 0,
    unitPriceUsd: 0,
    category: "",
    imageUrl: undefined,
  };
  return {
    version: 1,
    mode,
    dateKey,
    gameId,
    startedAt: Date.now(),
    inventions: [blankInv, { ...blankInv, id: "B" }, { ...blankInv, id: "C" }],
    selectedInventionId: undefined,
    suggestion: "",
    revisedPitch: "",
    investedUsd: undefined,
    ownershipShare: undefined,
    isComplete: false,
    sim: undefined,
  };
}

function reviveBankroll(raw: unknown): ClientBankrollState | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as any;
  if (typeof v.bankrollUsd !== "number") return null;
  return v as ClientBankrollState;
}

function makeInitialBankroll(): ClientBankrollState {
  return { version: 1, bankrollUsd: INVEST_STARTING_BANKROLL_USD, lastSeenDateKey: undefined };
}

export function useInvestorGame() {
  const todayKey = useMemo(() => todayInvestDateKey(), []);

  const [day, setDay] = useState<ClientInvestDayState | null>(null);
  const [bankroll, setBankroll] = useState<ClientBankrollState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revising, setRevising] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [popup, setPopup] = useState<null | { title: string; message: string }>(null);

  // Load bankroll + day state from localStorage.
  useEffect(() => {
    try {
      const storedBankroll = window.localStorage.getItem(INVEST_BANKROLL_STORAGE_KEY);
      const revivedBankroll = storedBankroll ? reviveBankroll(JSON.parse(storedBankroll)) : null;
      setBankroll(revivedBankroll || makeInitialBankroll());
    } catch {
      setBankroll(makeInitialBankroll());
    }

    try {
      const storedDay = window.localStorage.getItem(INVEST_DAY_STORAGE_KEY);
      const revivedDay = storedDay ? reviveDayState(JSON.parse(storedDay)) : null;
      if (revivedDay && revivedDay.mode === "daily" && revivedDay.dateKey === todayKey) {
        setDay(revivedDay);
        setLoading(false);
        return;
      }
    } catch {
      // ignore
    }

    setDay(makeEmptyDayState("daily", todayKey, todayKey));
    setLoading(false);
  }, [todayKey]);

  // Persist bankroll
  useEffect(() => {
    if (!bankroll) return;
    try {
      window.localStorage.setItem(INVEST_BANKROLL_STORAGE_KEY, JSON.stringify(bankroll));
    } catch {
      // ignore
    }
  }, [bankroll]);

  // Persist day
  useEffect(() => {
    if (!day) return;
    try {
      window.localStorage.setItem(INVEST_DAY_STORAGE_KEY, JSON.stringify(day));
    } catch {
      // ignore
    }
  }, [day]);

  // Apply bankroll floor on first view of a new day.
  useEffect(() => {
    if (!bankroll) return;
    if (bankroll.lastSeenDateKey === todayKey) return;
    setBankroll((prev) => {
      if (!prev) return prev;
      const next: ClientBankrollState = { ...prev, lastSeenDateKey: todayKey };
      if (next.bankrollUsd < INVEST_BANKROLL_FLOOR_USD) next.bankrollUsd = INVEST_BANKROLL_FLOOR_USD;
      if (!Number.isFinite(next.bankrollUsd) || next.bankrollUsd <= 0) next.bankrollUsd = INVEST_BANKROLL_FLOOR_USD;
      return next;
    });
  }, [bankroll, todayKey]);

  const start = useCallback(
    async (mode: GameMode) => {
      setError(null);
      const dateKey = todayKey;
      const res = await fetch("/api/invest/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, dateKey }),
      });
      if (!res.ok) {
        let msg = "Could not start today's slate.";
        try {
          const data = (await res.json()) as ErrorResponse;
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as StartResponse;
      setDay((prev) => {
        const next = makeEmptyDayState(data.mode, data.dateKey, data.gameId);
        next.inventions = data.inventions;
        // If we were restarting within the same mode/day and already completed, keep the completed run.
        if (prev && prev.mode === data.mode && prev.dateKey === data.dateKey && prev.isComplete) return prev;
        return next;
      });
    },
    [todayKey],
  );

  const hasSlate = Boolean(day?.inventions?.every((x) => x?.title && x?.pitch && x?.valuationUsd));

  // Ensure slate exists / is loaded
  useEffect(() => {
    if (!day) return;
    if (day.isComplete) return;
    if (hasSlate) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await start(day.mode);
      } catch {
        if (!cancelled) setError("Could not start today's slate. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [day, hasSlate, start]);

  const resetDaily = useCallback(() => {
    setDay(makeEmptyDayState("daily", todayKey, todayKey));
  }, [todayKey]);

  const startRandom = useCallback(async () => {
    try {
      setLoading(true);
      await start("debug-random");
    } catch {
      setError("Could not start a random slate. Try again.");
    } finally {
      setLoading(false);
    }
  }, [start]);

  const selectInvention = useCallback((id: InventionId) => {
    setDay((prev) => (prev ? { ...prev, selectedInventionId: id } : prev));
  }, []);

  const setSuggestion = useCallback((text: string) => {
    setDay((prev) => (prev ? { ...prev, suggestion: text } : prev));
  }, []);

  const revisePitch = useCallback(async () => {
    if (!day || day.isComplete) return;
    if (!day.selectedInventionId) return;
    const suggestion = (day.suggestion || "").trim();
    if (!suggestion) return;
    setRevising(true);
    setError(null);
    try {
      const res = await fetch("/api/invest/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: day.mode,
          dateKey: day.dateKey,
          gameId: day.gameId,
          inventionId: day.selectedInventionId,
          suggestion,
        }),
      });
      if (!res.ok) {
        let msg = "Could not revise the pitch. Try again.";
        try {
          const data = (await res.json()) as ErrorResponse;
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as ReviseResponse;
      const revisedPitch = String(data.revisedPitch || "").trim();
      if (revisedPitch) {
        setDay((prev) => (prev ? { ...prev, revisedPitch } : prev));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revise the pitch. Try again.");
    } finally {
      setRevising(false);
    }
  }, [day]);

  const fetchRevisedPitch = useCallback(
    async (inventionId: InventionId, suggestion: string): Promise<string> => {
      const mode = day?.mode || "daily";
      const dateKey = day?.dateKey || todayKey;
      const gameId = day?.gameId || todayKey;
      const res = await fetch("/api/invest/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          dateKey,
          gameId,
          inventionId,
          suggestion,
        }),
      });
      if (!res.ok) {
        let msg = "Could not revise the pitch. Try again.";
        try {
          const data = (await res.json()) as ErrorResponse;
          if (data?.error) msg = data.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }
      const data = (await res.json()) as ReviseResponse;
      return String(data.revisedPitch || "").trim();
    },
    [day, todayKey],
  );

  const simulate = useCallback(
    async (investedUsd: number) => {
      if (!day) return;
      if (day.isComplete && day.sim) return;
      if (!bankroll) return;
      if (!day.selectedInventionId) return;
      const inv = day.inventions.find((x) => x.id === day.selectedInventionId);
      if (!inv) return;

      const maxInvestFromValuation = Math.floor(inv.valuationUsd * INVEST_MAX_INVEST_FRACTION_OF_VALUATION);
      const maxInvest = Math.max(0, Math.min(maxInvestFromValuation, Math.floor(bankroll.bankrollUsd)));
      const amount = Math.max(0, Math.min(Math.floor(investedUsd), maxInvest));
      if (amount <= 0) return;

      const ownershipShare = Math.min(INVEST_MAX_INVEST_FRACTION_OF_VALUATION, amount / inv.valuationUsd);

      // Choose what "shipped": revisedPitch if present, else original pitch (or revised via suggestion if user typed one).
      let finalPitch = (day.revisedPitch || "").trim();
      if (!finalPitch) {
        const suggestion = (day.suggestion || "").trim();
        if (suggestion) finalPitch = await fetchRevisedPitch(day.selectedInventionId, suggestion);
      }
      if (!finalPitch) finalPitch = inv.pitch;

      setSimulating(true);
      setError(null);

      // Lock immediately.
      setDay((prev) => {
        if (!prev) return prev;
        return { ...prev, isComplete: true, investedUsd: amount, ownershipShare };
      });

      try {
        const res = await fetch("/api/invest/simulate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: day.mode,
            dateKey: day.dateKey,
            gameId: day.gameId,
            inventionId: day.selectedInventionId,
            revisedPitch: finalPitch,
            investedUsd: amount,
          }),
        });
        if (!res.ok) {
          let msg = "Market is busy. Try again.";
          try {
            const data = (await res.json()) as ErrorResponse;
            if (data?.error) msg = data.error;
          } catch {
            // ignore
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as SimResponse;
        const sim: InvestSimResult = {
          unitsSold: data.unitsSold,
          narrative: String(data.narrative || "").trim(),
          grossRevenueUsd: data.grossRevenueUsd,
          ownershipShare: data.ownershipShare,
          payoutUsd: data.payoutUsd,
        };

        setDay((prev) => (prev ? { ...prev, sim, revisedPitch: finalPitch } : prev));
        setPopup({ title: "MARKET", message: sim.narrative });

        setBankroll((prev) => {
          if (!prev) return prev;
          const nextUsd = Math.max(0, Math.round(prev.bankrollUsd - amount + sim.payoutUsd));
          return { ...prev, bankrollUsd: nextUsd };
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Market is busy. Try again.");
      } finally {
        setSimulating(false);
      }
    },
    [bankroll, day, fetchRevisedPitch],
  );

  const retryMarket = useCallback(async () => {
    if (!day) return;
    if (!day.isComplete) return;
    if (day.sim) return;
    if (!day.selectedInventionId) return;
    if (typeof day.investedUsd !== "number" || day.investedUsd <= 0) return;
    await simulate(day.investedUsd);
  }, [day, simulate]);

  const dismissPopup = useCallback(() => setPopup(null), []);

  return {
    todayKey,
    day,
    bankroll,
    isLoaded: !loading && !!day && !!bankroll,
    loading,
    error,
    revising,
    simulating,
    popup,
    dismissPopup,
    resetDaily,
    startRandom,
    selectInvention,
    setSuggestion,
    revisePitch,
    simulate,
    retryMarket,
  } as const;
}


