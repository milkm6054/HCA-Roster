export type ValidationIssue = {
  type:
    | "INVALID_STEAM_ID"
    | "GAMESPASS_ID"
    | "DUPLICATE_IN_UPLOAD"
    | "DUPLICATE_ACROSS_TEAMS"
    | "NEW_ACCOUNT";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  steamIdInput: string;
  steamId64?: string;
  message: string;
  rowNumbers?: number[];
  conflictingTeams?: string[];
};

export type RosterValidationResult = {
  validRows: number;
  invalidRows: number;
  issues: ValidationIssue[];
};
