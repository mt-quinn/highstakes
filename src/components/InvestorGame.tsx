"use client";

import { useEffect, useMemo, useState } from "react";

import { useInvestorGame } from "@/hooks/useInvestorGame";
import { INVEST_MAX_INVEST_FRACTION_OF_VALUATION } from "@/lib/constants";
import type { Invention, InventionId } from "@/lib/investTypes";

const moneyFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

export function InvestorGame() {
  const {
    day,
    bankroll,
    isLoaded,
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
  } = useInvestorGame();

  const [investOpen, setInvestOpen] = useState(false);
  const [amount, setAmount] = useState<number>(0);

  const selected = useMemo(() => {
    if (!day?.selectedInventionId) return null;
    return day.inventions.find((x) => x.id === day.selectedInventionId) || null;
  }, [day]);

  const maxInvest = useMemo(() => {
    if (!selected || !bankroll) return 0;
    const maxByValuation = Math.floor(selected.valuationUsd * INVEST_MAX_INVEST_FRACTION_OF_VALUATION);
    return Math.max(0, Math.min(maxByValuation, Math.floor(bankroll.bankrollUsd)));
  }, [bankroll, selected]);

  const ownershipShare = useMemo(() => {
    if (!selected || !amount) return 0;
    if (selected.valuationUsd <= 0) return 0;
    return Math.min(INVEST_MAX_INVEST_FRACTION_OF_VALUATION, amount / selected.valuationUsd);
  }, [amount, selected]);

  // Keep amount in range as selection/bankroll changes.
  useEffect(() => {
    if (!selected) return;
    const next = Math.max(0, Math.min(amount || 0, maxInvest));
    setAmount(next);
  }, [amount, maxInvest, selected]);

  // Default selection: first invention once slate loads.
  useEffect(() => {
    if (!day) return;
    if (!day.inventions?.[0]?.title) return;
    if (day.selectedInventionId) return;
    selectInvention("A");
  }, [day, selectInvention]);

  if (!isLoaded || !day || !bankroll) {
    return (
      <div className="h-full flex items-center justify-center px-6">
        <div className="text-sm text-pg-muted">Spinning up…</div>
      </div>
    );
  }

  const suggestion = day.suggestion || "";
  const revisedPitch = (day.revisedPitch || "").trim();

  return (
    <div className="h-full flex flex-col">
      <header className="px-5 pt-2 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-xl text-pg-gold drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]">
            High Stakes
          </div>
          <div className="text-[0.75rem] text-pg-muted mt-0.5">
            Bankroll: <span className="text-pg-text font-semibold">{moneyFmt.format(bankroll.bankrollUsd)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDaily}
            className="rounded-full border border-white/15 px-3 py-1 bg-black/20 hover:bg-black/35 transition text-[0.7rem] text-pg-muted"
            disabled={loading}
          >
            Reset daily
          </button>
          <button
            type="button"
            onClick={startRandom}
            className="rounded-full border border-pg-cyan/40 px-3 py-1 bg-pg-cyan/15 hover:bg-pg-cyan/25 transition text-[0.7rem] text-pg-cyan"
            disabled={loading}
          >
            Random game
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col gap-3 px-4 pb-4">
        {error && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[0.75rem] text-red-200">
            {error}
          </div>
        )}

        {/* Full-height: 3 inventions, each with all info */}
        <section className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-black/30 overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <div className="text-xs tracking-[0.22em] uppercase text-pg-muted font-black">Today’s inventors</div>
            <div className="text-[0.7rem] text-pg-muted">Tap to select • Invest from the selected card</div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3 grid grid-cols-1 gap-3">
            {day.inventions.map((inv) => (
              <InventionCard
                key={inv.id}
                inv={inv}
                bankrollUsd={bankroll.bankrollUsd}
                selected={day.selectedInventionId === inv.id}
                isComplete={day.isComplete}
                hasSim={!!day.sim}
                onSelect={() => {
                  selectInvention(inv.id);
                  setAmount(0);
                  setInvestOpen(false);
                }}
                onOpenInvest={() => {
                  selectInvention(inv.id);
                  setInvestOpen(true);
                }}
              />
            ))}
          </div>
        </section>
      </div>

      {selected && (
        <InvestModal
          open={investOpen}
          onClose={() => setInvestOpen(false)}
          inv={selected}
          bankrollUsd={bankroll.bankrollUsd}
          amount={amount}
          setAmount={setAmount}
          suggestion={suggestion}
          setSuggestion={setSuggestion}
          revisedPitch={revisedPitch}
          revising={revising}
          simulating={simulating}
          isComplete={day.isComplete}
          hasSim={!!day.sim}
          onApplySuggestion={revisePitch}
          onInvest={() => simulate(amount)}
          onRetryMarket={retryMarket}
        />
      )}

      {popup && <Modal title={popup.title} message={popup.message} onClose={dismissPopup} />}
    </div>
  );
}

function InventionCard({
  inv,
  bankrollUsd,
  selected,
  isComplete,
  hasSim,
  onSelect,
  onOpenInvest,
}: {
  inv: Invention;
  bankrollUsd: number;
  selected: boolean;
  isComplete: boolean;
  hasSim: boolean;
  onSelect: () => void;
  onOpenInvest: () => void;
}) {
  const idLabel = inv.id;
  const maxByValuation = Math.floor((inv.valuationUsd || 0) * INVEST_MAX_INVEST_FRACTION_OF_VALUATION);
  const maxInvest = Math.max(0, Math.min(maxByValuation, Math.floor(bankrollUsd)));
  const maxShareToday =
    inv.valuationUsd && inv.valuationUsd > 0
      ? Math.min(INVEST_MAX_INVEST_FRACTION_OF_VALUATION, maxInvest / inv.valuationUsd)
      : 0;

  return (
    <div
      className={`text-left rounded-2xl border px-3 py-3 transition ${
        selected ? "border-pg-gold/60 bg-pg-gold/10" : "border-white/10 bg-black/20 hover:bg-black/25"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="space-y-3">
          {/* Top row: image left, stats right */}
          <div className="flex items-start gap-3">
            <div className="w-[34%] max-w-[170px] aspect-square rounded-xl overflow-hidden border border-white/10 bg-black/40 flex items-center justify-center shrink-0">
              {inv.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inv.imageUrl} alt={inv.title} className="w-full h-full object-cover" />
              ) : (
                <div className="text-[0.7rem] text-pg-muted px-2 text-center">Illustration…</div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 pr-1">
                  <div className="text-[0.65rem] tracking-[0.28em] uppercase text-pg-muted font-black">
                    Inventor {idLabel}
                  </div>
                  <div className="mt-1 text-sm font-bold text-pg-text break-words">
                    {inv.title || "Loading…"}
                  </div>
                  <div className="mt-1 text-[0.7rem] text-pg-muted break-words">
                    {inv.descriptors?.filter(Boolean).join(" + ") || ""}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-[0.6rem] tracking-[0.22em] uppercase text-pg-muted font-black">Valuation</div>
                  <div className="text-[0.8rem] font-semibold text-pg-text">
                    {moneyFmt.format(inv.valuationUsd || 0)}
                  </div>
                  <div className="mt-1 text-[0.6rem] tracking-[0.22em] uppercase text-pg-muted font-black">Unit</div>
                  <div className="text-[0.8rem] font-semibold text-pg-text">
                    {moneyFmt.format(inv.unitPriceUsd || 0)}
                  </div>
                  <div className="mt-1 text-[0.65rem] text-pg-muted">
                    Up to <span className="text-pg-gold font-semibold">{pctFmt.format(maxShareToday)}</span> today
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pitch: full width under top row */}
          <pre className="whitespace-pre-wrap text-[0.82rem] leading-snug text-pg-text/90 font-semibold">
            {inv.pitch || ""}
          </pre>
        </div>
      </button>

      {/* Actions live on selected card */}
      {selected && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="text-[0.7rem] text-pg-muted">
            Max invest today: <span className="text-pg-text font-semibold">{moneyFmt.format(maxInvest)}</span>
          </div>

          {!isComplete || !hasSim ? (
            <button
              type="button"
              onClick={onOpenInvest}
              className="rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-[0.85rem] font-bold text-black shadow-pg-glow disabled:opacity-60"
              disabled={maxInvest <= 0}
            >
              Invest!
            </button>
          ) : (
            <div className="text-[0.7rem] text-pg-muted">Completed today.</div>
          )}
        </div>
      )}
    </div>
  );
}

function InvestModal({
  open,
  onClose,
  inv,
  bankrollUsd,
  amount,
  setAmount,
  suggestion,
  setSuggestion,
  revisedPitch,
  revising,
  simulating,
  isComplete,
  hasSim,
  onApplySuggestion,
  onInvest,
  onRetryMarket,
}: {
  open: boolean;
  onClose: () => void;
  inv: Invention;
  bankrollUsd: number;
  amount: number;
  setAmount: (n: number) => void;
  suggestion: string;
  setSuggestion: (s: string) => void;
  revisedPitch: string;
  revising: boolean;
  simulating: boolean;
  isComplete: boolean;
  hasSim: boolean;
  onApplySuggestion: () => void;
  onInvest: () => void;
  onRetryMarket: () => void;
}) {
  const maxByValuation = Math.floor((inv.valuationUsd || 0) * INVEST_MAX_INVEST_FRACTION_OF_VALUATION);
  const maxInvest = Math.max(0, Math.min(maxByValuation, Math.floor(bankrollUsd)));
  const share = inv.valuationUsd ? Math.min(INVEST_MAX_INVEST_FRACTION_OF_VALUATION, (amount || 0) / inv.valuationUsd) : 0;

  useEffect(() => {
    if (!open) return;
    setAmount(Math.max(0, Math.min(amount || 0, maxInvest)));
  }, [amount, maxInvest, open, setAmount]);

  if (!open) return null;

  const locked = simulating || (isComplete && hasSim);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/70">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-black/70 backdrop-blur shadow-pg-card px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.65rem] tracking-[0.25em] uppercase text-pg-gold font-black">
              INVEST IN
            </div>
            <div className="mt-1 text-sm font-bold text-pg-text break-words">{inv.title}</div>
            <div className="mt-1 text-[0.7rem] text-pg-muted">
              Your share: <span className="text-pg-gold font-semibold">{pctFmt.format(share)}</span>{" "}
              (cap {pctFmt.format(INVEST_MAX_INVEST_FRACTION_OF_VALUATION)})
            </div>
          </div>
          <button
            type="button"
            className="text-xs rounded-full border border-white/20 px-3 py-1 bg-white/10 hover:bg-white/15"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="text-xs tracking-[0.22em] uppercase text-pg-muted font-black">
            Improve the pitch (optional)
          </div>
          <input
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="e.g. ‘Make it appeal to parents and add a juicy tagline.’"
            className="w-full rounded-xl bg-black border border-white/20 px-3 py-2 text-[0.85rem] text-pg-text"
            disabled={locked}
            maxLength={220}
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onApplySuggestion}
              className="rounded-full border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-[0.8rem] text-pg-text disabled:opacity-60"
              disabled={locked || !suggestion.trim() || revising}
            >
              {revising ? "Rewriting…" : "Apply suggestion"}
            </button>
            {revisedPitch && <div className="text-[0.7rem] text-pg-muted">Revision ready.</div>}
          </div>

          <div className="pt-1 border-t border-white/10" />

          <div className="flex items-center justify-between">
            <div className="text-xs tracking-[0.22em] uppercase text-pg-muted font-black">Investment</div>
            <div className="text-[0.7rem] text-pg-muted">
              Max: <span className="text-pg-text font-semibold">{moneyFmt.format(maxInvest)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Math.min(Number(e.target.value || 0), maxInvest)))}
              className="w-[44%] rounded-xl bg-black border border-white/20 px-3 py-2 text-[0.85rem] text-pg-text"
              disabled={locked || maxInvest <= 0}
              min={0}
              max={maxInvest}
              step={100}
            />
            <input
              type="range"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              min={0}
              max={maxInvest}
              step={100}
              className="flex-1"
              disabled={locked || maxInvest <= 0}
            />
          </div>

          {!isComplete || !hasSim ? (
            <button
              type="button"
              onClick={onInvest}
              className="w-full rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-[0.9rem] font-bold text-black shadow-pg-glow disabled:opacity-60"
              disabled={locked || amount <= 0 || simulating || maxInvest <= 0}
            >
              {simulating ? "Shipping to market…" : "Invest (today only)"}
            </button>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[0.8rem] text-pg-muted">
              Today’s investment is complete. Come back tomorrow.
            </div>
          )}

          {isComplete && !hasSim && (
            <button
              type="button"
              onClick={onRetryMarket}
              className="w-full rounded-full border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-[0.85rem] font-bold text-pg-text disabled:opacity-60"
              disabled={simulating}
            >
              {simulating ? "Retrying…" : "Retry market outcome"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Modal({
  title,
  message,
  onClose,
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/70">
      <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-black/70 backdrop-blur shadow-pg-card px-4 py-3">
        <div className="text-[0.65rem] tracking-[0.25em] uppercase text-pg-gold font-black">
          {title}
        </div>
        <pre className="mt-2 whitespace-pre-wrap text-[0.9rem] leading-snug font-semibold text-pg-text">
          {message}
        </pre>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-[0.85rem] font-bold text-black shadow-pg-glow"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}


