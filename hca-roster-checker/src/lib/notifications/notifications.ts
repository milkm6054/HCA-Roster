type NotificationEvent = {
  type: "ROSTER_VALIDATION_SUMMARY" | "MATCH_VIOLATION_ALERT";
  payload: Record<string, unknown>;
};

export async function queueNotification(event: NotificationEvent): Promise<void> {
  // TODO: Plug this into Discord bot/webhook notifications in a dedicated integration service.
  // Keep core roster logic independent so database + web app remains source of truth.
  void event;
}
