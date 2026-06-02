import { AccountAgeRisk } from "@prisma/client";

export type AccountAgeResult = {
  estimatedCreatedAt: Date | null;
  accountAgeRisk: AccountAgeRisk;
};

export function estimateSteamAccountCreatedAt(steamId64: string): AccountAgeResult {
  if (!/^\d{17}$/.test(steamId64)) {
    return {
      estimatedCreatedAt: null,
      accountAgeRisk: AccountAgeRisk.UNKNOWN,
    };
  }

  const id = BigInt(steamId64);

  // TODO: Replace this deterministic placeholder with Steam Web API based account age checks.
  const ageInDays = Number(id % 5000n) + 30;
  const created = new Date("2026-01-01T00:00:00.000Z");
  created.setUTCDate(created.getUTCDate() - ageInDays);

  if (ageInDays < 60) {
    return { estimatedCreatedAt: created, accountAgeRisk: AccountAgeRisk.CRITICAL };
  }

  if (ageInDays < 120) {
    return { estimatedCreatedAt: created, accountAgeRisk: AccountAgeRisk.HIGH };
  }

  if (ageInDays < 365) {
    return { estimatedCreatedAt: created, accountAgeRisk: AccountAgeRisk.MEDIUM };
  }

  return { estimatedCreatedAt: created, accountAgeRisk: AccountAgeRisk.LOW };
}
