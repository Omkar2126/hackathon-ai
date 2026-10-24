import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, people } from "@/db/schema";
import { embedText } from "@/lib/embeddings";
import { inferWithGemma } from "@/lib/gemma";
import { publishLive } from "@/lib/live";
import { serializeConversation } from "@/lib/serialize";
import { transcribeWithWhisper } from "@/lib/whisper";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({
      id: conversations.id,
      personId: conversations.personId,
      transcript: conversations.transcript,
      summary: conversations.summary,
      reminder: conversations.reminder,
      keyFacts: conversations.keyFacts,
      source: conversations.source,
      createdAt: conversations.createdAt,
      personName: people.name,
    })
    .from(conversations)
    .leftJoin(people, eq(people.id, conversations.personId))
    .orderBy(desc(conversations.createdAt))
    .limit(80);

  return Response.json({ conversations: rows.map(serializeConversation) });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  let transcript = "";
  let personId: string | null = null;
  let source = "whisper";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const audio = form.get("audio");
    const fallbackText = String(form.get("transcript") ?? "");
    personId = String(form.get("personId") ?? "") || null;
    const file = audio instanceof File ? audio : null;
    const whisper = await transcribeWithWhisper({
      audio: file ? await file.arrayBuffer() : undefined,
      filename: file?.name,
      mimeType: file?.type,
      fallbackText,
    });
    transcript = whisper.text;
    source = whisper.engine === "whisper" ? "whisper" : "whisper-live";
  } else {
    const body = (await request.json()) as {
      transcript?: string;
      personId?: string | null;
      audioBase64?: string;
    };
    personId = body.personId ?? null;
    const whisper = await transcribeWithWhisper({
      fallbackText: body.transcript,
    });
    transcript = whisper.text;
    source = whisper.engine === "whisper" ? "whisper" : "whisper-live";
  }

  if (!transcript) {
    return Response.json({ error: "Nothing to remember yet." }, { status: 400 });
  }

  let personContext: { name: string; relationship: string; notes?: string; memories?: string[]; lastSummary?: string } | null =
    null;
  if (personId) {
    const [person] = await db.select().from(people).where(eq(people.id, personId)).limit(1);
    if (person) {
      const memoryRows = await db.select().from(memories).where(eq(memories.personId, personId)).limit(8);
      const [last] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.personId, personId))
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

  const [conversation] = await db
    .insert(conversations)
    .values({
      personId,
      transcript,
      summary: inference.summary,
      reminder: inference.reminder,
      keyFacts: inference.keyFacts,
      embedding: embedText(`${inference.summary} ${transcript}`),
      source,
    })
    .returning();

  if (personId && inference.keyFacts.length > 0) {
    await db.insert(memories).values(
      inference.keyFacts.map((fact) => ({
        personId,
        content: fact,
        category: "conversation",
        embedding: embedText(fact),
        conversationId: conversation.id,
      })),
    );
  }

  publishLive("memory", {
    conversationId: conversation.id,
    personId,
    summary: inference.summary,
    reminder: inference.reminder,
    keyFacts: inference.keyFacts,
  });

  return Response.json({
    conversation: serializeConversation({
      ...conversation,
      personName: personContext?.name ?? null,
    }),
    inference,
  });
}
