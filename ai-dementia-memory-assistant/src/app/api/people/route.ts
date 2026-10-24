import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memories, people, visits } from "@/db/schema";
import { ensureSeed } from "@/lib/seed";
import { serializePerson } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSeed();
    const rows = await db
      .select({
        id: people.id,
        name: people.name,
        relationship: people.relationship,
        notes: people.notes,
        avatarUrl: people.avatarUrl,
        lastSeenAt: people.lastSeenAt,
        createdAt: people.createdAt,
        memoryCount: sql<number>`cast(count(distinct ${memories.id}) as int)`,
        visitCount: sql<number>`cast(count(distinct ${visits.id}) as int)`,
      })
      .from(people)
      .leftJoin(memories, eq(memories.personId, people.id))
      .leftJoin(visits, eq(visits.personId, people.id))
      .groupBy(people.id)
      .orderBy(desc(people.lastSeenAt), people.name);

    return Response.json({ people: rows.map(serializePerson) });
  } catch (error) {
    console.error("GET /api/people error:", error);
    return Response.json({ people: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      relationship?: string;
      notes?: string;
      avatarUrl?: string | null;
    };
    const name = body.name?.trim();
    const relationship = body.relationship?.trim();
    if (!name || !relationship) {
      return Response.json({ error: "Name and relationship are required." }, { status: 400 });
    }

    const [person] = await db
      .insert(people)
      .values({
        name,
        relationship,
        notes: body.notes?.trim() ?? "",
        avatarUrl: body.avatarUrl ?? null,
      })
      .returning();

    return Response.json({ person: serializePerson({ ...person, memoryCount: 0, visitCount: 0 }) });
  } catch (error) {
    console.error("POST /api/people error:", error);
    return Response.json({ error: "Failed to create person." }, { status: 500 });
  }
}
