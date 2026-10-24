import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, people, visits } from "@/db/schema";
import {
  serializeConversation,
  serializeMemory,
  serializePerson,
  serializeVisit,
} from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  const { personId } = await params;
  const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
  if (!person) return Response.json({ error: "Not found" }, { status: 404 });

  const [memoryRows, conversationRows, visitRows] = await Promise.all([
    db.select().from(memories).where(eq(memories.personId, personId)).orderBy(desc(memories.createdAt)).limit(8),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.personId, personId))
      .orderBy(desc(conversations.createdAt))
      .limit(4),
    db.select().from(visits).where(eq(visits.personId, personId)).orderBy(desc(visits.startedAt)).limit(4),
  ]);

  const last = conversationRows[0];
  return Response.json({
    overlay: {
      ...serializePerson(person),
      reminder:
        last?.reminder || `This is ${person.name}, your ${person.relationship.toLowerCase()}.`,
      keyFacts: last?.keyFacts?.length ? last.keyFacts : memoryRows.slice(0, 4).map((row) => row.content),
      lastSummary: last?.summary ?? person.notes,
      memories: memoryRows.map(serializeMemory),
      conversations: conversationRows.map(serializeConversation),
      visits: visitRows.map(serializeVisit),
    },
  });
}
