/**
 * Student seats. An educator plan includes INCLUDED_SEATS; each student
 * enrolled in any of the teacher's classes uses one, however many of those
 * classes they are in. Purchased seat packs add to the total (stage 4).
 */

export const INCLUDED_SEATS = 100;

export const seatsUsed = (enrollments: { studentId: string }[]) =>
  new Set(enrollments.map((e) => e.studentId)).size;

export const seatsLeft = (enrollments: { studentId: string }[], total: number) =>
  Math.max(0, total - seatsUsed(enrollments));
