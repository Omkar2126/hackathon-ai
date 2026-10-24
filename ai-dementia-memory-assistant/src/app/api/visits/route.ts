import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { people, visits } from "@/db/schema";
import { publishLive } from "@/lib/live";
import { serializeVisit } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: visits.id,
      personId: visits.personId,
      startedAt: visits.startedAt,
      endedAt: visits.endedAt,
      greeting: visits.greeting,
      personName: people.name,
      relationship: people.relationship,
      avatarUrl: people.avatarUrl,
    })
    .from(visits)
    .innerJoin(people, eq(people.id, visits.personId))
    .orderBy(desc(visits.startedAt))
    .limit(40);

  return Response.json({
    visits: rows.map((row) => ({
      ...serializeVisit(row),
      personName: row.personName,
      relationship: row.relationship,
      avatarUrl: row.avatarUrl,
    })),
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { personId?: string; greeting?: string };
  if (!body.personId) {
    return Response.json({ error: "personId is required." }, { status: 400 });
  }

  const recent = await db
    .select()
    .from(visits)
    .where(eq(visits.personId, body.personId))
    .orderBy(desc(visits.startedAt))
    .limit(1);

  const last = recent[0];
  if (last && Date.now() - last.startedAt.getTime() < 2 * 60 * 1000) {
    return Response.json({ visit: serializeVisit(last), reused: true });
  }

  const [visit] = await db
    .insert(visits)
    .values({
      personId: body.personId,
      greeting: body.greeting ?? null,
    })
    .returning();

  await db.update(people).set({ lastSeenAt: visit.startedAt }).where(eq(people.id, body.personId));
  publishLive("visit", { personId: body.personId, greeting: body.greeting });

  return Response.json({ visit: serializeVisit(visit), reused: false });
}
