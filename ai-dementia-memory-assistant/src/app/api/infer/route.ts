import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, people } from "@/db/schema";
import { inferWithGemma } from "@/lib/gemma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { transcript?: string; personId?: string | null };
  const transcript = body.transcript?.trim();
  if (!transcript) {
    return Response.json({ error: "Transcript is required." }, { status: 400 });
  }

  let personContext = null;
  if (body.personId) {
    const [person] = await db.select().from(people).where(eq(people.id, body.personId)).limit(1);
    if (person) {
      const memoryRows = await db.select().from(memories).where(eq(memories.personId, body.personId)).limit(8);
      const [last] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.personId, body.personId))
        .orderBy(desc(conversations.createdAt))
        .limit(1);
      personContext = {
        name: person.name,
        relationship: person.relationship,
        notes: person.notes,
        memories: memoryRows.map((row) => row.content),
        lastSummary: last?.summary,
      };
    }
  }

  const inference = await inferWithGemma({
    transcript,
    person: personContext,
    patientName: "Margaret",
  });

  return Response.json({ inference });
}
