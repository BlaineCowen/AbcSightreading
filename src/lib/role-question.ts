import { writable } from "svelte/store";

/**
 * Where WelcomeNote's "Are you a student or a teacher?" stands on this page:
 * "pending" until it is known whether to ask, "asking" while it is open, then
 * "teacher", "student" or "none" (not asked). The founding-teacher offer
 * (HomeDashboard) waits for it and stays away from students.
 */
export type RoleState = "pending" | "asking" | "teacher" | "student" | "none";
export const roleQuestion = writable<RoleState>("pending");
