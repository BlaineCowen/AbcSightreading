import { gunzipSync, gzipSync } from "node:zlib";
import { del, get, put } from "@vercel/blob";
import { prisma } from "./db";
import { serverEnv } from "./env";
import { PieceReadError, readMusicXml } from "../pieces/read-musicxml";
import { MAX_PIECES, MAX_UPLOAD_BYTES, defaultPartSettings, type PieceSummary } from "../pieces/rules";
import type { PieceScore } from "../pieces/model";

/**
 * A teacher's pieces on the server. The upload is read here (the same reader
 * the tests check), so what is stored is what this code made of the file:
 * the file itself, kept compressed for reading again as the reader improves,
 * and the model, gzipped JSON. Both are private Blobs under
 * pieces/<user>/<piece>/; the row says where.
 */

export class PieceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

const token = () => {
  const t = serverEnv("BLOB_READ_WRITE_TOKEN");
  if (!t) throw new PieceError("Pieces cannot be stored from here.", 503);
  return t;
};

type Row = {
  id: string;
  title: string;
  composer: string;
  sourceName: string;
  bars: number;
  parts: unknown;
  warnings: unknown;
  createdAt: Date;
};

export function summaryOf(p: Row): PieceSummary {
  const parts = p.parts && typeof p.parts === "object" ? Object.values(p.parts as Record<string, { name?: string }>) : [];
  return {
    id: p.id,
    title: p.title,
    composer: p.composer,
    sourceName: p.sourceName,
    bars: p.bars,
    parts: parts.map((x) => x.name ?? "Part"),
    warnings: Array.isArray(p.warnings) ? (p.warnings as string[]) : [],
    createdAt: p.createdAt.getTime(),
  };
}

const SUMMARY = { id: true, title: true, composer: true, sourceName: true, bars: true, parts: true, warnings: true, createdAt: true } as const;

export async function listPieces(userId: string): Promise<PieceSummary[]> {
  const rows = await prisma.piece.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: SUMMARY });
  return rows.map(summaryOf);
}

/** Reads the upload and stores it. `bytes` is always a compressed .mxl. */
export async function createPiece(userId: string, bytes: Uint8Array, fileName: string): Promise<PieceSummary> {
  if (bytes.length === 0) throw new PieceError("That file is empty.");
  if (bytes.length > MAX_UPLOAD_BYTES) throw new PieceError("That file is too large. Pieces can be up to 4 MB once compressed.", 413);
  const count = await prisma.piece.count({ where: { userId } });
  if (count >= MAX_PIECES) throw new PieceError(`You can keep up to ${MAX_PIECES} pieces. Delete one to add another.`, 409);

  let score;
  try {
    score = readMusicXml(bytes, fileName);
  } catch (e) {
    if (e instanceof PieceReadError) throw new PieceError(e.message);
    throw new PieceError("This file could not be read as MusicXML.");
  }

  const id = crypto.randomUUID().replace(/-/g, "");
  const base = `pieces/${userId}/${id}`;
  const t = token();
  const sourceName = fileName.slice(0, 200);
  const [source, model] = await Promise.all([
    put(`${base}/source.mxl`, Buffer.from(bytes), { access: "private", token: t, addRandomSuffix: false, contentType: "application/vnd.recordare.musicxml" }),
    put(`${base}/score.json.gz`, gzipSync(JSON.stringify(score)), { access: "private", token: t, addRandomSuffix: false, contentType: "application/gzip" }),
  ]);
  try {
    const row = await prisma.piece.create({
      data: {
        id,
        userId,
        title: score.title.slice(0, 120) || "Untitled",
        composer: (score.composer ?? "").slice(0, 120),
        sourceName,
        sourcePath: source.pathname,
        scorePath: model.pathname,
        parts: defaultPartSettings(score),
        bars: score.measures.length,
        warnings: score.warnings,
      },
      select: SUMMARY,
    });
    return summaryOf(row);
  } catch (e) {
    await del([source.pathname, model.pathname], { token: t }).catch(() => {});
    throw e;
  }
}

/** A piece this user owns. */
export async function pieceFor(userId: string, id: string) {
  return prisma.piece.findFirst({ where: { id, userId } });
}

/**
 * A piece this user may read: their own, or one in the library of a class
 * they are in (every piece ever assigned to it; a student hears the parts as
 * their teacher set them), or one assigned to it.
 */
export async function pieceForReader(userId: string, id: string) {
  const own = await pieceFor(userId, id);
  if (own) return own;
  const inClass = { class: { enrollments: { some: { studentId: userId } } } };
  const shelved = await prisma.classPiece.findFirst({ where: { pieceId: id, ...inClass }, select: { id: true } });
  const assigned = shelved ?? (await prisma.assignment.findFirst({ where: { presetKey: `piece:${id}`, ...inClass }, select: { id: true } }));
  return assigned ? prisma.piece.findUnique({ where: { id } }) : null;
}

/**
 * A student's library: every song assigned to a class they are in, newest
 * first, each with the classes it came from. Kept after the assignment goes.
 */
export async function libraryFor(userId: string) {
  const rows = await prisma.classPiece.findMany({
    where: { class: { enrollments: { some: { studentId: userId } } } },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      class: { select: { name: true } },
      piece: { select: { id: true, title: true, composer: true, bars: true, parts: true } },
    },
  });
  const byPiece = new Map<string, { id: string; title: string; composer: string; bars: number; parts: string[]; classes: string[]; addedAt: number }>();
  for (const r of rows) {
    const had = byPiece.get(r.piece.id);
    if (had) {
      if (!had.classes.includes(r.class.name)) had.classes.push(r.class.name);
      continue;
    }
    const parts = r.piece.parts && typeof r.piece.parts === "object" ? Object.values(r.piece.parts as Record<string, { name?: string }>).map((x) => x.name ?? "Part") : [];
    byPiece.set(r.piece.id, { id: r.piece.id, title: r.piece.title, composer: r.piece.composer, bars: r.piece.bars, parts, classes: [r.class.name], addedAt: r.createdAt.getTime() });
  }
  return [...byPiece.values()];
}

/** The stored model, read. */
export async function loadScore(scorePath: string): Promise<PieceScore> {
  return JSON.parse(gunzipSync(await scoreBytes(scorePath)).toString("utf8")) as PieceScore;
}

/** The stored model, still gzipped, to hand to the browser as it is. */
export async function scoreBytes(scorePath: string): Promise<Uint8Array> {
  const got = await get(scorePath, { access: "private", token: token(), useCache: false });
  if (!got || got.statusCode !== 200 || !got.stream) throw new PieceError("This piece's music could not be found.", 404);
  return new Uint8Array(await new Response(got.stream).arrayBuffer());
}

export async function deletePiece(userId: string, id: string): Promise<boolean> {
  const piece = await prisma.piece.findFirst({ where: { id, userId }, select: { sourcePath: true, scorePath: true } });
  if (!piece) return false;
  const assigned = await prisma.assignment.count({ where: { presetKey: `piece:${id}` } });
  if (assigned) {
    throw new PieceError(`This piece is assigned to a class${assigned > 1 ? ` (${assigned} assignments)` : ""}. Remove the assignment first, then delete the piece.`, 409);
  }
  await prisma.piece.delete({ where: { id } });
  await del([piece.sourcePath, piece.scorePath], { token: token() }).catch(() => {});
  return true;
}
