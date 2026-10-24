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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (!person) return Response.json({ error: "Not found" }, { status: 404 });

  const [memoryRows, conversationRows, visitRows] = await Promise.all([
    db.select().from(memories).where(eq(memories.personId, id)).orderBy(desc(memories.createdAt)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.personId, id))
      .orderBy(desc(conversations.createdAt)),
    db.select().from(visits).where(eq(visits.personId, id)).orderBy(desc(visits.startedAt)),
  ]);

  const last = conversationRows[0];
  return Response.json({
    person: {
      ...serializePerson(person),
      reminder:
        last?.reminder || `This is ${person.name}, your ${person.relationship.toLowerCase()}.`,
      keyFacts: last?.keyFacts?.length
        ? last.keyFacts
        : memoryRows.slice(0, 4).map((row) => row.content),
      lastSummary: last?.summary ?? person.notes,
      memories: memoryRows.map(serializeMemory),
      conversations: conversationRows.map(serializeConversation),
      visits: visitRows.map(serializeVisit),
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as {
    name?: string;
    relationship?: string;
    notes?: string;
    avatarUrl?: string | null;
  };

  const [person] = await db
    .update(people)
    .set({
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.relationship ? { relationship: body.relationship.trim() } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl } : {}),
    })
    .where(eq(people.id, id))
    .returning();

  if (!person) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ person: serializePerson(person) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.delete(people).where(eq(people.id, id));
  return Response.json({ ok: true });
}
