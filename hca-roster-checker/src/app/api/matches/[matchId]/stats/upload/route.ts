import { NextResponse } from "next/server";
import { createAuditLog } from "@/lib/audit/auditLog";
import { isOrga, requireApiSession } from "@/lib/auth/guards";
import { getActor } from "@/lib/auth/getActor";
import { readCsvFromRequest } from "@/lib/http/readCsvFromRequest";
import { checkMatchRoster } from "@/lib/matches/checkMatchRoster";
import { parseMatchStatsCsv } from "@/lib/matches/parseMatchStatsCsv";
import { queueNotification } from "@/lib/notifications/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  if (!isOrga(auth.session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { matchId } = await params;
  const { csvText, sourceFileName } = await readCsvFromRequest(request);

  if (!csvText.trim()) {
    return NextResponse.json({ error: "No CSV data found." }, { status: 400 });
  }

  const parsed = parseMatchStatsCsv(csvText);

  const summary = await checkMatchRoster({
    matchId,
    rows: parsed.rows,
    sourceFileName,
  });

  await createAuditLog({
    action: "MATCH_STATS_UPLOADED",
    actor: await getActor(request),
    entityType: "Match",
    entityId: matchId,
    details: {
      sourceFileName,
      totalRows: parsed.rows.length,
      malformedRows: parsed.malformedRows.length,
      summary,
    },
  });

  await queueNotification({
    type: "MATCH_VIOLATION_ALERT",
    payload: {
      matchId,
      summary,
    },
  });

  return NextResponse.json({
    malformedRows: parsed.malformedRows,
    summary,
  });
}
