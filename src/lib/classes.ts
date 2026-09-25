import { writable, get } from "svelte/store";
import { signedInUser } from "./auth-client";
import type { ClassWithProgress } from "./class-validate";

/**
 * A director's classes and what each has passed, for the page. Signed-in only:
 * a class is teacher data worth keeping, so it lives on the account, and
 * signed out none of this appears.
 *
 * `classes` is shared by everything on the page (the preset bar and its
 * picker), so marking a pass in one place shows everywhere at once.
 */

export const classes = writable<ClassWithProgress[]>([]);
/** Whether the list has been asked for and the user is signed in. */
export const classesAvailable = writable(false);
/** The class being taught, remembered per browser. */
export const selectedClassId = writable<string | null>(null);

const SELECTED_KEY = "abcsr_selected_class";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `The server said ${res.status}.`);
  return body as T;
}

let loading: Promise<void> | null = null;

/** Loads the list once per page; later calls share the first. */
export function loadClasses(): Promise<void> {
  loading ??= (async () => {
    if (!(await signedInUser())) return;
    const list = await api<ClassWithProgress[]>("/api/classes");
    classes.set(list);
    classesAvailable.set(true);
    let remembered: string | null = null;
    try {
      remembered = localStorage.getItem(SELECTED_KEY);
    } catch {}
    selectedClassId.set(list.some((c) => c.id === remembered) ? remembered : null);
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export function selectClass(id: string | null) {
  selectedClassId.set(id);
  try {
    if (id) localStorage.setItem(SELECTED_KEY, id);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {}
}

const replace = (c: ClassWithProgress) =>
  classes.update((list) => list.map((x) => (x.id === c.id ? c : x)));

export async function createClass(name: string): Promise<ClassWithProgress> {
  const created = await api<ClassWithProgress>("/api/classes", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  classes.update((list) => [...list, created]);
  return created;
}

export async function renameClass(id: string, name: string) {
  replace(await api<ClassWithProgress>(`/api/classes/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }));
}

/** Moves a class one place up (-1) or down (+1), renumbering the list. */
export async function moveClass(id: string, by: -1 | 1) {
  const list = [...get(classes)];
  const from = list.findIndex((c) => c.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  const renumbered = list.map((c, position) => ({ ...c, position }));
  classes.set(renumbered);
  // Only the two that moved change position.
  await Promise.all(
    [renumbered[from], renumbered[to]].map((c) =>
      api(`/api/classes/${c.id}`, { method: "PATCH", body: JSON.stringify({ position: c.position }) })
    )
  );
}

export async function deleteClass(id: string) {
  await api(`/api/classes/${id}`, { method: "DELETE" });
  classes.update((list) => list.filter((c) => c.id !== id));
  if (get(selectedClassId) === id) selectClass(null);
}

/** Marks a preset passed (or not) for a class. The list updates in place. */
export async function setPassed(classId: string, presetKey: string, passed: boolean) {
  replace(
    await api<ClassWithProgress>(`/api/classes/${classId}/progress`, {
      method: "PUT",
      body: JSON.stringify({ presetKey, passed }),
    })
  );
}
