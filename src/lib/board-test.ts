/**
 * Board tests (Blaine, 16 November 2026): a sight-reading test given in
 * class, one student at a time, on the teacher's device at the front. The
 * teacher sets the exercise on the Unison page and starts it from Grade;
 * each student taps their name, gets a new exercise, studies it until they
 * press Ready, and is graded (clapped or sung). Retry runs the same exercise
 * again; Next student goes back to the names.
 *
 * It is an assignment like any other (one per class, made together), with
 * `params.board` set, so its scores are in the gradebook and the test can
 * run over several days and in several classes: the names show who is done.
 * Students never see it on their list, and cannot send attempts at it
 * themselves: the teacher's device sends them, for the student (attempts.ts).
 *
 * Owner only while it is tested: ownerSees("board-test").
 */

/** The address parameter that opens an assignment's board test on the page. */
export const BOARD_PARAM = "board";

/** Is this assignment a board test? */
export const isBoardTest = (params: unknown) =>
  typeof params === "object" && params !== null && (params as { board?: unknown }).board === true;

export type BoardStudent = { id: string; name: string; tries: number; best: number | null };
export type BoardRoster = { className: string; title: string; students: BoardStudent[] };

/** First names first, as students look for their own. */
export const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** How many are done (a graded try) out of the class. */
export const doneCount = (students: BoardStudent[]) => students.filter((s) => s.best !== null).length;
