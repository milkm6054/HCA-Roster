import { getSessionFromRequest } from "@/lib/auth/session";

export async function getActor(request: Request): Promise<string> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    return "anonymous";
  }

  return `${session.email} (${session.role})`;
}
