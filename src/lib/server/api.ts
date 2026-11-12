import { auth } from "./auth";
import { noteSignedIn } from "./plan-cache";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/** The signed-in user for this request, or null. */
export async function currentUser(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  noteSignedIn(session?.user?.id);
  return session?.user ?? null;
}

export const notSignedIn = () => json({ error: "Sign in to use saved presets." }, 401);

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
