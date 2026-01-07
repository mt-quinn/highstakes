import { INVEST_DAILY_SEED_VERSION } from "@/lib/constants";
import { localDateYYYYMMDD } from "@/lib/dateKey";

/**
 * Investor game daily key (local calendar day + independent seed version).
 */
export function todayInvestDateKey(d = new Date()): string {
  return `${localDateYYYYMMDD(d)}-v${INVEST_DAILY_SEED_VERSION}`;
}


