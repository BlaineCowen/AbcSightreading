import { signedInUser } from "./auth-client";
import {
  deletePreset,
  getPresets,
  renamePreset,
  savePreset,
  type SavedPreset,
} from "./preset-storage";

/**
 * Saved presets from wherever they live: the account when someone is signed
 * in, this browser's localStorage when not. Same shape either way, so the
 * dropdown does not care which.
 *
 * Signed out, this is exactly the old behaviour. Signed in, the first load of
 * each list copies this browser's presets into the account (once per user per
 * list; the server drops any it already has, so a second tab or a retry adds
 * nothing). The browser's copies are left alone - signing out gets them back.
 */

/** The same list key the page passes to preset-storage. */
const CHORAL_STORE = "abcsr_presets";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `The server said ${res.status}.`);
  return body as T;
}

const importedKey = (userId: string, store: string) => `abcsr_imported:${userId}:${store}`;

export interface PresetList<P> {
  presets: SavedPreset<P>[];
  /** Whether they came from the account (true) or this browser. */
  synced: boolean;
}

export async function listPresets<P>(store: string = CHORAL_STORE): Promise<PresetList<P>> {
  const user = await signedInUser();
  if (!user) return { presets: getPresets<P>(store), synced: false };

  const flag = importedKey(user.id, store);
  let alreadyImported = false;
  try {
    alreadyImported = localStorage.getItem(flag) === "1";
  } catch {}
  const local = alreadyImported ? [] : getPresets<P>(store);
  // The import answers with the whole list, so it doubles as the load.
  const presets = local.length
    ? await api<SavedPreset<P>[]>("/api/presets?import=1", {
        method: "POST",
        body: JSON.stringify({ store, presets: local }),
      })
    : await api<SavedPreset<P>[]>(`/api/presets?store=${encodeURIComponent(store)}`);
  try {
    localStorage.setItem(flag, "1");
  } catch {}
  return { presets, synced: true };
}

export async function addPreset<P>(
  name: string,
  params: P,
  store: string = CHORAL_STORE
): Promise<SavedPreset<P>> {
  if (!(await signedInUser())) return savePreset(name, params, store);
  return api<SavedPreset<P>>("/api/presets", {
    method: "POST",
    body: JSON.stringify({ store, name, params }),
  });
}

export async function removePreset(id: string, store: string = CHORAL_STORE): Promise<void> {
  if (!(await signedInUser())) {
    deletePreset(id, store);
    return;
  }
  await api(`/api/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function renameSavedPreset(
  id: string,
  name: string,
  store: string = CHORAL_STORE
): Promise<void> {
  if (!(await signedInUser())) {
    renamePreset(id, name, store);
    return;
  }
  await api(`/api/presets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}
