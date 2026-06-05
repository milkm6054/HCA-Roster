const STEAMID64_MIN = 76561197960265728n;

export type SteamNormalizationResult =
  | {
      ok: true;
      input: string;
      steamId64: string;
      steamId3?: string;
    }
  | {
      ok: false;
      input: string;
      reason: string;
    };

function toSteamId64FromAccountId(accountId: bigint): string {
  return (STEAMID64_MIN + accountId).toString();
}

export function isValidSteamId64(value: string): boolean {
  if (!/^\d{17}$/.test(value)) {
    return false;
  }

  const parsed = BigInt(value);
  return parsed >= STEAMID64_MIN;
}

export function isLikelyGamespassId(value: string): boolean {
  const cleaned = value.trim();
  return /^[a-f0-9]{32}$/i.test(cleaned);
}

export function normalizeSteamId(input: string): SteamNormalizationResult {
  const cleaned = input.trim();

  if (!cleaned) {
    return {
      ok: false,
      input,
      reason: "Steam ID is empty.",
    };
  }

  if (isValidSteamId64(cleaned)) {
    return {
      ok: true,
      input,
      steamId64: cleaned,
    };
  }

  const steamId3Match = cleaned.match(/^\[U:1:(\d+)\]$/i);
  if (steamId3Match?.[1]) {
    const accountId = BigInt(steamId3Match[1]);
    return {
      ok: true,
      input,
      steamId64: toSteamId64FromAccountId(accountId),
      steamId3: `[U:1:${accountId.toString()}]`,
    };
  }

  const legacySteamIdMatch = cleaned.match(/^STEAM_[0-5]:([0-1]):(\d+)$/i);
  if (legacySteamIdMatch?.[1] && legacySteamIdMatch?.[2]) {
    const y = BigInt(legacySteamIdMatch[1]);
    const z = BigInt(legacySteamIdMatch[2]);
    const accountId = z * 2n + y;
    return {
      ok: true,
      input,
      steamId64: toSteamId64FromAccountId(accountId),
      steamId3: `[U:1:${accountId.toString()}]`,
    };
  }

  return {
    ok: false,
    input,
    reason: "Could not normalize to SteamID64.",
  };
}
