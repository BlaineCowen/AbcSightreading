import type { APIRoute } from "astro";

/**
 * A printed book's exercise, from its QR code: /b/<book>/<n> opens that exact
 * exercise on its practice page, where it can be shown on screen, played,
 * labelled with solfège or note names, slowed down, and sung and graded.
 * The exercises are written once, by scripts/make-book.ts, into
 * src/data/books/<book>.json, so a book always opens what it printed.
 */
type Book = { id: string; title: string; exercises: { n: number; page: string; packed: string }[] };
const books = Object.values(import.meta.glob<Book>("../../../data/books/*.json", { eager: true, import: "default" }));

export const GET: APIRoute = ({ params, redirect }) => {
  const book = books.find((b) => b.id === params.book);
  const exercise = book?.exercises.find((e) => String(e.n) === params.n);
  if (!book || !exercise) return new Response("No such exercise in that book.", { status: 404 });
  return redirect(`${exercise.page}?from=book-${book.id}#ex=${exercise.packed}`, 302);
};
