// --- Investor game (High Stakes) ---
// Keep independent from Pearly Gates so we can reshuffle inventions without affecting the other game.
export const INVEST_DAILY_SEED_VERSION = 3;
export const INVEST_DAY_STORAGE_KEY = "high-stakes-invest-day-v1";
export const INVEST_BANKROLL_STORAGE_KEY = "high-stakes-invest-bankroll-v1";

export const INVEST_STARTING_BANKROLL_USD = 100_000;
export const INVEST_BANKROLL_FLOOR_USD = 10_000;

export const INVEST_INVENTIONS_PER_DAY = 3;

export const INVEST_VALUATION_MIN_USD = 20_000;
export const INVEST_VALUATION_MAX_USD = 500_000;
export const INVEST_UNIT_PRICE_MIN_USD = 5;
export const INVEST_UNIT_PRICE_MAX_USD = 5_000;

export const INVEST_MAX_INVEST_FRACTION_OF_VALUATION = 0.75;
export const INVEST_MIN_UNITS_SOLD = 1;
export const INVEST_MAX_UNITS_SOLD = 1_000_000;


