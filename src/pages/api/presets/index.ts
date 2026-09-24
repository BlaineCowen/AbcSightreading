import type { APIRoute } from "astro";
import { currentUser, json, notSignedIn, readJson } from "../../../lib/server/api";
import { prisma } from "../../../lib/server/db";
import {
  checkNewPreset,
  isPresetStore,
  MAX_PRESETS_PER_STORE,
  presetsToImport,
  type NewPreset,
} from "../../../lib/preset-validate";

/**
 * The signed-in user's saved presets.
 *
 * GET  ?store=<list>                   -> SavedPreset[], oldest first
 * POST { store, name, params }         -> the new SavedPreset
 * POST ?import=1 { store, presets[] }  -> SavedPreset[] (the whole list after)
 *
 * The shape handed back is the one localStorage has always held
 * (`{ id, name, createdAt: epoch ms, params }`), so the dropdown treats a
 * preset the same wherever it came from.
 */

type Row = { id: string; name: string; createdAt: Date; params: unknown };
const toSaved = (p: Row) => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt.getTime(),
  params: p.params,
});

const list = (userId: string, store: string) =>
  prisma.preset.findMany({
    where: { userId, store },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, createdAt: true, params: true },
  });

export const GET: APIRoute = async ({ request, url }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const store = url.searchParams.get("store");
  if (!isPresetStore(store)) return json({ error: "Unknown preset list." }, 400);
  return json((await list(user.id, store)).map(toSaved));
};

export const POST: APIRoute = async ({ request, url }) => {
  const user = await currentUser(request);
  if (!user) return notSignedIn();
  const body = await readJson(request);

  if (url.searchParams.has("import")) {
    const b = (body ?? {}) as { store?: unknown; presets?: unknown };
    if (!isPresetStore(b.store)) return json({ error: "Unknown preset list." }, 400);
    const store = b.store;
    if (!Array.isArray(b.presets)) return json({ error: "Expected a list of presets." }, 400);
    // Bad entries are skipped, not fatal: one corrupt preset in someone's
    // browser should not keep the rest out of their account.
    const incoming = b.presets
      .map((p) => checkNewPreset(p, store))
      .filter((c): c is { ok: true; value: NewPreset } => c.ok)
      .map((c) => c.value);
    const existing = await list(user.id, store);
    const room = MAX_PRESETS_PER_STORE - existing.length;
    const fresh = presetsToImport(incoming, existing).slice(0, Math.max(0, room));
    if (fresh.length) {
      await prisma.preset.createMany({
        data: fresh.map((p) => ({
          userId: user.id,
          store,
          name: p.name,
          params: p.params as object,
          createdAt: p.createdAt,
        })),
      });
    }
    return json((await list(user.id, store)).map(toSaved));
  }

  const checked = checkNewPreset(body);
  if (!checked.ok) return json({ error: checked.error }, 400);
  const { store, name, params } = checked.value;
  const count = await prisma.preset.count({ where: { userId: user.id, store } });
  if (count >= MAX_PRESETS_PER_STORE) {
    return json({ error: `You can keep up to ${MAX_PRESETS_PER_STORE} presets here.` }, 409);
  }
  const created = await prisma.preset.create({
    data: { userId: user.id, store, name, params: params as object },
    select: { id: true, name: true, createdAt: true, params: true },
  });
  return json(toSaved(created), 201);
};
