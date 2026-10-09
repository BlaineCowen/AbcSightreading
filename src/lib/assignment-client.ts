import { ASSIGNMENT_PARAM, assignmentPath } from "./practice";

/**
 * The practice pages' side of assignments: which one the address names, and
 * fetching it. The page applies its preset and locks the settings.
 */

export type OpenAssignment = {
  id: string;
  title: string;
  page: "unison" | "choral" | "piece";
  presetKey: string;
  /** A saved preset as it was assigned: { id, name, params }. */
  params: unknown;
  minutes: number;
  note: string;
  dueAt: number | null;
  role: "teacher" | "student";
  seconds: number;
};

export const assignmentIdFromUrl = () =>
  typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(ASSIGNMENT_PARAM);

/** The assignment, or null. On the wrong page, goes to the right one. */
export async function fetchAssignment(id: string, here: "unison" | "choral"): Promise<OpenAssignment | null> {
  try {
    const res = await fetch(`/api/assignments/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const a = (await res.json()) as OpenAssignment;
    if (a.page !== here) {
      location.href = `${assignmentPath(a)}?${ASSIGNMENT_PARAM}=${encodeURIComponent(id)}`;
      return null;
    }
    return a;
  } catch {
    return null;
  }
}

export const assignmentHref = (a: { id: string; page: string; presetKey?: string }) =>
  `${assignmentPath(a)}?${ASSIGNMENT_PARAM}=${encodeURIComponent(a.id)}`;
