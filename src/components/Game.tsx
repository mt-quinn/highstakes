"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_QUESTION_CHARS, MAX_QUESTIONS } from "@/lib/constants";
import { usePearlyGatesGame } from "@/hooks/usePearlyGatesGame";

type Judgment = "HEAVEN" | "HELL";

export function Game() {
  const {
    state,
    isLoaded,
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
  } = usePearlyGatesGame();

  const [question, setQuestion] = useState("");
  const qaScrollRef = useRef<HTMLDivElement | null>(null);
  const faceRef = useRef<HTMLDivElement | null>(null);

  const qaCount = state?.qa.length ?? 0;
  const questionsLeft = MAX_QUESTIONS - qaCount;

  useEffect(() => {
    const el = qaScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [qaCount, state?.isComplete]);

  const canAsk = useMemo(() => {
    if (!state) return false;
    if (state.isComplete) return false;
    if (asking || loading) return false;
    if (qaCount >= MAX_QUESTIONS) return false;
    return true;
  }, [state, asking, loading, qaCount]);

  const canStamp = useMemo(() => {
    if (!state) return false;
    if (state.isComplete) return false;
    if (judging) return false;
    return true;
  }, [state, judging]);

  const onSubmitQuestion = async () => {
    if (!canAsk) return;
    const trimmed = question.trim();
    if (!trimmed) return;
    await ask(trimmed);
    setQuestion("");
  };

  const handleStamp = async (judgment: Judgment) => {
    if (!canStamp) return;
    await judge(judgment);
  };

  const faceEmoji = state?.visible.faceEmoji || "🙂";
  const hasProfile = Boolean(state?.visible.name);

  return (
    <div className="h-full flex flex-col">
      <header className="px-5 pt-2 pb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.6rem] tracking-[0.35em] uppercase text-pg-muted">
            Tonight’s judgment
          </div>
          <div className="font-display text-xl text-pg-gold drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]">
            Pearly Gates
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDaily}
            className="rounded-full border border-white/15 px-3 py-1 bg-black/20 hover:bg-black/35 transition text-[0.7rem] text-pg-muted"
            disabled={!isLoaded}
          >
            Reset daily
          </button>
          <button
            type="button"
            onClick={startRandom}
            className="rounded-full border border-pg-cyan/40 px-3 py-1 bg-pg-cyan/15 hover:bg-pg-cyan/25 transition text-[0.7rem] text-pg-cyan"
            disabled={!isLoaded}
          >
            Random game
          </button>
        </div>
      </header>

      {!isLoaded || !state ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2 px-6">
            <div className="text-sm text-pg-muted">Spinning up…</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top half: Gates */}
          <section className="flex-1 min-h-0 relative overflow-hidden px-4 pb-3">
            <div className="absolute inset-0 pointer-events-none">
              {/* clouds */}
              <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-[140%] h-40 bg-white/10 blur-2xl rounded-full" />
              <div className="absolute -bottom-16 left-1/3 w-[90%] h-40 bg-white/10 blur-2xl rounded-full" />
              <div className="absolute top-10 left-8 w-32 h-32 bg-pg-cyan/15 blur-2xl rounded-full" />
              <div className="absolute top-8 right-10 w-36 h-36 bg-pg-gold/15 blur-2xl rounded-full" />
            </div>

            {/* Gates illustration */}
            <div className="absolute inset-x-0 top-8 flex items-start justify-center pointer-events-none">
              <div className="relative w-64 h-40">
                <div className="absolute left-0 top-8 w-16 h-28 rounded-2xl bg-white/10 border border-white/15 shadow-inner" />
                <div className="absolute right-0 top-8 w-16 h-28 rounded-2xl bg-white/10 border border-white/15 shadow-inner" />
                <div className="absolute left-1/2 -translate-x-1/2 top-0 w-40 h-24 rounded-t-[999px] bg-white/10 border border-white/15 shadow-inner" />
                <div className="absolute left-1/2 -translate-x-1/2 top-10 w-40 h-28 rounded-2xl border border-white/10 bg-black/10" />
              </div>
            </div>

            {/* Visible card */}
            <div className="relative z-10 pt-2">
              <div className="rounded-2xl bg-black/25 border border-white/10 px-4 py-3 shadow-inner">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[0.6rem] tracking-[0.25em] uppercase text-pg-muted">
                      Soul intake card
                    </div>
                    <div className="mt-1 text-sm font-semibold text-pg-text truncate">
                      {hasProfile ? state.visible.name : "Loading…"}
                    </div>
                    <div className="mt-0.5 text-[0.8rem] text-pg-muted">
                      {hasProfile ? `${state.visible.age} • ${state.visible.occupation}` : ""}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-[0.6rem] tracking-[0.25em] uppercase text-pg-muted">
                      Cause
                    </div>
                    <div className="mt-1 text-[0.8rem] text-pg-text max-w-[10rem]">
                      {hasProfile ? state.visible.causeOfDeath : ""}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-[0.75rem] text-pg-muted italic">
                  “{hasProfile ? state.visible.quote : "…"}”
                </div>
              </div>
            </div>

            {/* Character face */}
            <div className="absolute inset-x-0 bottom-4 flex items-end justify-center">
              <div className="relative">
                <div
                  ref={faceRef}
                  className="select-none text-[92px] leading-none drop-shadow-[0_10px_24px_rgba(0,0,0,0.75)]"
                  aria-label="Character face"
                >
                  {faceEmoji}
                </div>

                {state.judgment && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={`rotate-[-12deg] text-[2.1rem] font-black tracking-[0.22em] uppercase drop-shadow-[0_10px_16px_rgba(0,0,0,0.75)] ${
                        state.judgment === "HEAVEN" ? "text-pg-green" : "text-pg-red"
                      }`}
                      style={{ WebkitTextStroke: "3px rgba(0,0,0,0.55)" }}
                    >
                      {state.judgment}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Bottom half: Desk */}
          <section className="flex-1 min-h-0 border-t border-white/10 bg-black/15 px-4 py-3 flex flex-col gap-3">
            {error && (
              <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-[0.75rem] text-red-200">
                {error}
              </div>
            )}

            {!state.isComplete ? (
              <div className="text-[0.75rem] text-pg-muted flex items-center justify-between">
                <span className="uppercase tracking-[0.18em]">Interrogation</span>
                <span className="text-pg-gold font-semibold">
                  Questions left: {questionsLeft}/{MAX_QUESTIONS}
                </span>
              </div>
            ) : (
              <div className="text-[0.75rem] text-pg-muted flex items-center justify-between">
                <span className="uppercase tracking-[0.18em]">Verdict</span>
                <span className="text-pg-gold font-semibold">
                  {state.wasCorrect === undefined
                    ? "Awaiting God…"
                    : state.wasCorrect
                      ? "Correct"
                      : "Wrong"}
                </span>
              </div>
            )}

            {/* Q/A log */}
            <div
              ref={qaScrollRef}
              className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 px-3 py-2"
            >
              {state.qa.length === 0 && !state.isComplete ? (
                <div className="py-8 text-center text-pg-muted text-sm">
                  Ask up to five questions. Then drag a stamp onto their face.
                </div>
              ) : (
                <div className="space-y-3 py-1">
                  {state.qa.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                        <div className="text-[0.6rem] tracking-[0.18em] uppercase text-pg-muted">
                          You
                        </div>
                        <div className="text-sm text-pg-text">{item.q}</div>
                      </div>
                      <div className="rounded-xl border border-pg-gold/25 bg-pg-gold/10 px-3 py-2">
                        <div className="text-[0.6rem] tracking-[0.18em] uppercase text-pg-muted">
                          {state.visible.name || "Soul"}
                        </div>
                        <div className="text-sm text-pg-text">{item.a}</div>
                      </div>
                    </div>
                  ))}

                  {state.isComplete && state.godMessage && (
                    <div className="rounded-2xl border border-pg-gold/30 bg-black/35 px-3 py-3">
                      <div className="text-[0.6rem] tracking-[0.25em] uppercase text-pg-gold">
                        GOD
                      </div>
                      <pre className="mt-2 whitespace-pre-wrap text-[0.85rem] leading-snug font-semibold text-pg-text">
                        {state.godMessage}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* If complete but no verdict yet: retry */}
            {state.isComplete && !state.godMessage && (
              <button
                type="button"
                onClick={retryVerdict}
                className="w-full rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-sm font-bold text-black shadow-pg-glow disabled:opacity-60"
                disabled={judging}
              >
                {judging ? "Summoning…" : "Retry verdict"}
              </button>
            )}

            {/* Input row */}
            {!state.isComplete && (
              <div className="space-y-2">
                <div className="relative">
                  <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSubmitQuestion();
                      }
                    }}
                    maxLength={MAX_QUESTION_CHARS}
                    placeholder="Ask a question…"
                    className="w-full rounded-2xl bg-black/35 border border-white/15 pl-4 pr-16 py-3 text-sm text-pg-text shadow-inner"
                    disabled={!canAsk}
                    aria-label="Question"
                  />
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.7rem] text-pg-muted/70">
                    {question.length}/{MAX_QUESTION_CHARS}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onSubmitQuestion}
                    disabled={!canAsk || !question.trim()}
                    className="flex-1 rounded-full bg-gradient-to-r from-pg-gold to-pg-cyan px-4 py-2 text-sm font-bold text-black shadow-pg-glow disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {asking ? "Asking…" : `Ask (${qaCount + 1}/${MAX_QUESTIONS})`}
                  </button>
                  <div className="text-[0.7rem] text-pg-muted whitespace-nowrap">
                    Day key: <span className="text-pg-text">{todayKey}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Stamp tray */}
            {!state.isComplete && (
              <div className="pt-1">
                <div className="text-[0.6rem] tracking-[0.25em] uppercase text-pg-muted text-center">
                  Drag to stamp
                </div>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <DraggableStamp
                    label="HEAVEN"
                    colorClass="bg-pg-green/20 border-pg-green/50 text-pg-green"
                    disabled={!canStamp}
                    faceRef={faceRef}
                    onStamp={() => handleStamp("HEAVEN")}
                  />
                  <DraggableStamp
                    label="HELL"
                    colorClass="bg-pg-red/20 border-pg-red/50 text-pg-red"
                    disabled={!canStamp}
                    faceRef={faceRef}
                    onStamp={() => handleStamp("HELL")}
                  />
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function DraggableStamp({
  label,
  colorClass,
  disabled,
  faceRef,
  onStamp,
}: {
  label: Judgment;
  colorClass: string;
  disabled: boolean;
  faceRef: React.RefObject<HTMLDivElement | null>;
  onStamp: () => void;
}) {
  const [drag, setDrag] = useState<null | { x: number; y: number; active: boolean }>(null);

  const finish = (x: number, y: number) => {
    const face = faceRef.current;
    if (!face) return;
    const r = face.getBoundingClientRect();
    const hit = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (hit) onStamp();
  };

  return (
    <>
      <button
        type="button"
        className={`relative select-none rounded-2xl border px-5 py-3 text-sm font-black tracking-[0.18em] uppercase shadow-inner ${colorClass} ${
          disabled ? "opacity-50 cursor-not-allowed" : "active:scale-[0.98]"
        }`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          setDrag({ x: e.clientX, y: e.clientY, active: true });
        }}
        onPointerMove={(e) => {
          if (!drag?.active) return;
          setDrag({ x: e.clientX, y: e.clientY, active: true });
        }}
        onPointerUp={(e) => {
          if (!drag?.active) return;
          const x = e.clientX;
          const y = e.clientY;
          setDrag(null);
          finish(x, y);
        }}
        onPointerCancel={() => setDrag(null)}
      >
        {label}
      </button>

      {drag?.active && (
        <div
          className={`fixed left-0 top-0 pointer-events-none z-50 select-none rounded-2xl border px-5 py-3 text-sm font-black tracking-[0.18em] uppercase ${colorClass}`}
          style={{
            transform: `translate(${drag.x}px, ${drag.y}px) translate(-50%, -50%) rotate(-8deg)`,
            boxShadow: "0 18px 40px rgba(0,0,0,0.65)",
          }}
        >
          {label}
        </div>
      )}
    </>
  );
}


