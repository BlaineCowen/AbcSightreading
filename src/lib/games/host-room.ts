import { clockOffset, formatLiveCode, type ClockSample } from "../live";
import type { GameAnswer, LiveGame } from "./live-game";

/**
 * The host's side of a class game, against the live room's API: the
 * director's own room (its permanent code and poster), Live on for the game,
 * the game's state published, the players and the answers read. The page
 * (GameHost.svelte) holds the game; this only talks to the server.
 */

export type HostRoom = { code: string; display: string; path: string };

/** The director's room, Live on for a game. A message to show when they cannot host (signed out, not Pro). */
export async function openRoom(): Promise<{ room: HostRoom } | { problem: string; upgrade?: boolean; signIn?: boolean }> {
  const res = await fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ page: "game" }) });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) return { problem: "Sign in to host a game with your class.", signIn: true };
  if (!res.ok) return { problem: data.error ?? "Could not open your room.", upgrade: !!data.upgrade };
  return { room: { code: data.room.code, display: formatLiveCode(data.room.code), path: data.room.path } };
}

/** Live off: the game is over and the room waits, as after any Live session. */
export const closeRoom = (code: string) => fetch(`/api/live/${code}`, { method: "DELETE" }).catch(() => null);

export async function publishGame(code: string, game: LiveGame): Promise<boolean> {
  const res = await fetch(`/api/live/${code}/game`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ game }),
  }).catch(() => null);
  return !!res?.ok;
}

/** The players in the room now: each device's name (a device in a game says its name as its part). */
export async function players(code: string): Promise<string[]> {
  const res = await fetch(`/api/live/${code}/devices`).catch(() => null);
  if (!res?.ok) return [];
  const data = (await res.json()) as { parts?: Record<string, number> };
  return Object.keys(data.parts ?? {}).filter(Boolean).sort();
}

export type RoundAnswer = { tag: string; name: string; answer: GameAnswer };
export async function answers(code: string, round: string): Promise<RoundAnswer[]> {
  const res = await fetch(`/api/live/${code}/game/answers?round=${encodeURIComponent(round)}`).catch(() => null);
  if (!res?.ok) return [];
  return ((await res.json()) as { answers: RoundAnswer[] }).answers;
}

/** How far the server's clock is ahead of this one (ms), from the quickest of a few readings, as a student's device measures it. */
export async function measureOffset(samples = 6): Promise<number> {
  const got: ClockSample[] = [];
  for (let i = 0; i < samples; i++) {
    const sent = Date.now();
    try {
      const res = await fetch("/api/live/time", { cache: "no-store" });
      const { now } = await res.json();
      got.push({ sent, server: now, received: Date.now() });
    } catch {}
  }
  return clockOffset(got)?.offset ?? 0;
}

/** A new round id. */
export const newRound = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
