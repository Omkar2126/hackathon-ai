import { eq } from "drizzle-orm";
import { db } from "@/db";
import { faceEmbeddings, people } from "@/db/schema";
import { l2Normalize } from "@/lib/embeddings";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  if (!person) return Response.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as {
    embeddings?: number[][];
    embedding?: number[];
    thumbnail?: string;
  };

  const vectors = (body.embeddings?.length ? body.embeddings : body.embedding ? [body.embedding] : [])
    .map((vector) => l2Normalize(vector))
    .filter((vector) => vector.length > 0);

  if (vectors.length === 0) {
    return Response.json({ error: "At least one face embedding is required." }, { status: 400 });
  }

  await db.insert(faceEmbeddings).values(
    vectors.map((embedding, index) => ({
      personId: id,
      embedding,
      thumbnail: index === 0 ? body.thumbnail ?? null : null,
    })),
  );

  if (body.thumbnail && !person.avatarUrl) {
    await db.update(people).set({ avatarUrl: body.thumbnail }).where(eq(people.id, id));
  }

  return Response.json({ ok: true, samples: vectors.length });
}
