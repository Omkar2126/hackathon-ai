import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { memories, people } from "@/db/schema";
import { embedText } from "@/lib/embeddings";
import { serializeMemory } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const personId = url.searchParams.get("personId");

  const base = db
    .select({
      id: memories.id,
      personId: memories.personId,
      content: memories.content,
      category: memories.category,
      conversationId: memories.conversationId,
      createdAt: memories.createdAt,
      personName: people.name,
    })
    .from(memories)
    .innerJoin(people, eq(people.id, memories.personId));

  const rows = personId
    ? await base.where(eq(memories.personId, personId)).orderBy(desc(memories.createdAt)).limit(120)
    : await base.orderBy(desc(memories.createdAt)).limit(120);

  return Response.json({
    memories: rows.map((row) => ({
      ...serializeMemory(row),
      personName: row.personName,
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    personId?: string;
    content?: string;
    category?: string;
  };
  if (!body.personId || !body.content?.trim()) {
    return Response.json({ error: "Person and memory content are required." }, { status: 400 });
  }

  const [memory] = await db
    .insert(memories)
    .values({
      personId: body.personId,
      content: body.content.trim(),
      category: body.category?.trim() || "note",
      embedding: embedText(body.content),
    })
    .returning();

  return Response.json({ memory: serializeMemory(memory) });
}
