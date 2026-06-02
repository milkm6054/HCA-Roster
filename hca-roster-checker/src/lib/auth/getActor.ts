import { headers } from "next/headers";

export async function getActor(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-actor") || "local-admin";
}
