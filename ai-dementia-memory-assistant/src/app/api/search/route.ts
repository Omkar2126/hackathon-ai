import { eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, people } from "@/db/schema";
import { embedText, topSimilar } from "@/lib/embeddings";
import { ensureSeed } from "@/lib/seed";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await ensureSeed();
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ results: [] });

  const query = embedText(q);
  const memoryRows = await db
    .select({
      id: memories.id,
      content: memories.content,
      embedding: memories.embedding,
      personId: memories.personId,
      personName: people.name,
      createdAt: memories.createdAt,
    })
    .from(memories)
    .innerJoin(people, eq(people.id, memories.personId));

  const conversationRows = await db
    .select({
      id: conversations.id,
      content: conversations.summary,
      embedding: conversations.embedding,
      personId: conversations.personId,
      personName: people.name,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .leftJoin(people, eq(people.id, conversations.personId));

  const combined = [
    ...memoryRows.map((row) => ({ ...row, kind: "memory" as const })),
    ...conversationRows.map((row) => ({ ...row, kind: "conversation" as const })),
  ];

  const ranked = topSimilar(query, combined, 8).filter((row) => row.score > 0.08);

  return Response.json({
    results: ranked.map((row) => ({
      id: row.id,
      kind: row.kind,
      content: row.content,
      personId: row.personId,
      personName: row.personName,
      score: row.score,
      createdAt: row.createdAt,
    })),
  });
}
