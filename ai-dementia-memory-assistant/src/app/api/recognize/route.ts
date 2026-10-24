import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, faceEmbeddings, memories, people } from "@/db/schema";
import { averageVectors, cosineSimilarity, l2Normalize } from "@/lib/embeddings";
import { serializePerson } from "@/lib/serialize";
import type { OverlayPerson } from "@/lib/types";

export const dynamic = "force-dynamic";

const MATCH_THRESHOLD = 0.82;

export async function POST(request: Request) {
  const body = (await request.json()) as { embeddings?: number[][]; embedding?: number[] };
  const queries = (body.embeddings?.length ? body.embeddings : body.embedding ? [body.embedding] : []).map(
    (vector) => l2Normalize(vector),
  );

  if (queries.length === 0) {
    return Response.json({ matches: [] });
  }

  const stored = await db.select().from(faceEmbeddings);
  const grouped = new Map<string, number[][]>();
  for (const row of stored) {
    const list = grouped.get(row.personId) ?? [];
    list.push(row.embedding);
    grouped.set(row.personId, list);
  }

  const prototypes = [...grouped.entries()].map(([personId, vectors]) => ({
    personId,
    vector: averageVectors(vectors),
  }));

  const matches = queries.map((query, index) => {
    let bestId: string | null = null;
    let bestScore = 0;
    for (const proto of prototypes) {
      const score = cosineSimilarity(query, proto.vector);
      if (score > bestScore) {
        bestScore = score;
        bestId = proto.personId;
      }
    }
    if (!bestId || bestScore < MATCH_THRESHOLD) {
      return { index, score: bestScore, person: null, overlay: null };
    }
    return { index, score: bestScore, personId: bestId };
  });

  const personIds = [
    ...new Set(matches.map((match) => ("personId" in match ? match.personId : null)).filter(Boolean)),
  ] as string[];

  const overlays = new Map<string, OverlayPerson>();
  await Promise.all(
    personIds.map(async (id) => {
      const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
      if (!person) return;
      const [memoryRows, conversationRows] = await Promise.all([
        db.select().from(memories).where(eq(memories.personId, id)).orderBy(desc(memories.createdAt)).limit(6),
        db
          .select()
          .from(conversations)
          .where(eq(conversations.personId, id))
          .orderBy(desc(conversations.createdAt))
          .limit(1),
      ]);
      const last = conversationRows[0];
      overlays.set(id, {
        ...serializePerson(person),
        reminder:
          last?.reminder ||
          `This is ${person.name}, your ${person.relationship.toLowerCase()}.`,
        keyFacts: last?.keyFacts?.length ? last.keyFacts : memoryRows.slice(0, 4).map((row) => row.content),
        lastSummary: last?.summary ?? person.notes,
      });
    }),
  );

  return Response.json({
    matches: matches.map((match) => {
      if (!("personId" in match) || !match.personId) {
        return { index: match.index, score: match.score, person: null, overlay: null };
      }
      const overlay = overlays.get(match.personId) ?? null;
      return {
        index: match.index,
        score: match.score,
        person: overlay,
        overlay,
      };
    }),
  });
}
