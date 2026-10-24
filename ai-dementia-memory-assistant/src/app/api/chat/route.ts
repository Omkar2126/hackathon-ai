import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, memories, people } from "@/db/schema";
import { embedText, topSimilar } from "@/lib/embeddings";
import { ensureSeed } from "@/lib/seed";
import { serializePerson } from "@/lib/serialize";

export const dynamic = "force-dynamic";

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `You are "Lumen Companion", an empathetic, gentle, and calming memory chatbot designed specifically for Margaret, who is living with mild-to-moderate dementia.

Core rules for speaking with Margaret:
1. Clarity & Brevity: Speak in short, warm, clear sentences. Avoid complex subordinate clauses or confusing pronouns.
2. Emotional Reassurance: Margaret may feel confused, anxious, or forgetful. Always validate her feelings and reassure her that she is safe and in good hands.
3. Grounded in Truth: Use ONLY the provided family, memories, and visit notes. Do not hallucinate relatives or medical changes.
4. Positive & Dignified: Treat Margaret with warmth and dignity as an adult. Never sound condescending.
5. Actionable Details: Mention concrete cues like names, relationships, pets, and recent comforting moments (e.g., "Sarah, your daughter, visited Sunday and brought lemon cake").
6. Formatting: Answer in 2-4 friendly sentences. You may add 2-3 short bullet points if listing facts or reminders.`;

export async function POST(request: Request) {
  try {
    await ensureSeed();

    const body = (await request.json()) as {
      message?: string;
      history?: ChatHistoryItem[];
      patientName?: string;
    };

    const query = body.message?.trim();
    if (!query) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const patientName = body.patientName || "Margaret";

    // 1. Fetch all people in Margaret's circle
    const allPeople = await db.select().from(people);
    const peopleList = allPeople.map((p) => serializePerson(p));

    // 2. Vector search memories and conversations
    const queryVector = embedText(query);

    const memoryRows = await db
      .select({
        id: memories.id,
        content: memories.content,
        embedding: memories.embedding,
        personId: memories.personId,
        personName: people.name,
      })
      .from(memories)
      .innerJoin(people, eq(people.id, memories.personId));

    const conversationRows = await db
      .select({
        id: conversations.id,
        content: conversations.summary,
        reminder: conversations.reminder,
        embedding: conversations.embedding,
        personId: conversations.personId,
        personName: people.name,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .leftJoin(people, eq(people.id, conversations.personId));

    const combinedSearchItems = [
      ...memoryRows.map((m) => ({
        id: m.id,
        kind: "memory" as const,
        content: m.content,
        embedding: m.embedding,
        personId: m.personId,
        personName: m.personName,
      })),
      ...conversationRows.map((c) => ({
        id: c.id,
        kind: "conversation" as const,
        content: `${c.reminder ? `${c.reminder} — ` : ""}${c.content}`,
        embedding: c.embedding,
        personId: c.personId,
        personName: c.personName,
      })),
    ];

    const ranked = topSimilar(queryVector, combinedSearchItems, 6);
    const relevantSnippets = ranked.map((r) => `${r.personName ? `[${r.personName}]: ` : ""}${r.content}`);

    // Detect matched people (either in text or in high-ranking search results)
    const normalizedQuery = query.toLowerCase();
    const matchedPeople = peopleList.filter((p) => {
      const nameMatch = normalizedQuery.includes(p.name.toLowerCase());
      const firstMatch = normalizedQuery.includes(p.name.split(" ")[0].toLowerCase());
      const relMatch = normalizedQuery.includes(p.relationship.toLowerCase());
      const rankedMatch = ranked.some((r) => r.personId === p.id && r.score > 0.15);
      return nameMatch || firstMatch || relMatch || rankedMatch;
    });

    // 3. Generate response via LLM or Local Intelligent Engine
    const apiKey =
      process.env.GROQ_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.FIREWORKS_API_KEY ||
      process.env.FIREWORKS_AI_API_KEY ||
      process.env.OPENROUTER_API_KEY;

    let reply = "";

    if (apiKey) {
      try {
        reply = await callLlmChat({
          apiKey,
          query,
          history: body.history || [],
          patientName,
          peopleList,
          relevantSnippets,
        });
      } catch {
        // Fallback to local engine
        reply = generateLocalChatReply(query, patientName, matchedPeople, peopleList, ranked);
      }
    }

    if (!reply) {
      reply = generateLocalChatReply(query, patientName, matchedPeople, peopleList, ranked);
    }

    // Generate dynamic follow-up suggestions
    const suggestedFollowUps = generateFollowUps(query, matchedPeople);

    return Response.json({
      reply,
      relatedPeople: matchedPeople.slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        relationship: p.relationship,
        avatarUrl: p.avatarUrl,
        notes: p.notes,
      })),
      sources: ranked.slice(0, 3).map((r) => ({
        content: r.content,
        personName: r.personName,
      })),
      suggestedFollowUps,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function callLlmChat(opts: {
  apiKey: string;
  query: string;
  history: ChatHistoryItem[];
  patientName: string;
  peopleList: ReturnType<typeof serializePerson>[];
  relevantSnippets: string[];
}): Promise<string> {
  const contextText = [
    `Patient: ${opts.patientName}`,
    "Known loved ones and caregivers:",
    ...opts.peopleList.map(
      (p) => `- ${p.name} (${p.relationship}): ${p.notes || ""}. Last seen: ${p.lastSeenAt || "recently"}`
    ),
    "",
    "Relevant memories and notes from the household log:",
    ...opts.relevantSnippets.map((s) => `- ${s}`),
  ].join("\n");

  const promptUser = `${contextText}\n\nMargaret asks: "${opts.query}"\n\nAnswer Margaret gently, warmly, and clearly:`;

  if (process.env.GROQ_API_KEY && opts.apiKey === process.env.GROQ_API_KEY) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_GEMMA_MODEL || "gemma2-9b-it",
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...opts.history.slice(-4).map((h) => ({ role: h.role, content: h.content })),
          { role: "user", content: promptUser },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim() || "";
    }
  }

  if (
    (process.env.GOOGLE_API_KEY && opts.apiKey === process.env.GOOGLE_API_KEY) ||
    (process.env.GEMINI_API_KEY && opts.apiKey === process.env.GEMINI_API_KEY)
  ) {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${opts.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${SYSTEM_PROMPT}\n\n${promptUser}` }],
            },
          ],
          generationConfig: { temperature: 0.3, maxOutputTokens: 300 },
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    }
  }

  return "";
}

function generateLocalChatReply(
  query: string,
  patientName: string,
  matchedPeople: ReturnType<typeof serializePerson>[],
  allPeople: ReturnType<typeof serializePerson>[],
  ranked: Array<{ content: string; personName?: string | null; score: number }>
): string {
  const q = query.toLowerCase();

  // Medication / Doctor queries
  if (q.includes("med") || q.includes("pill") || q.includes("donepezil") || q.includes("doctor")) {
    const doc = allPeople.find((p) => p.relationship.toLowerCase().includes("neurologist") || p.name.includes("Amira"));
    return `Your doctor is ${doc ? doc.name : "Dr. Amira Patel"}. Your routine medication is donepezil, taken in the morning with breakfast. You see Dr. Patel on the first Thursday of the month.`;
  }

  // Kettle / Kitchen / Daily item queries
  if (q.includes("kettle") || q.includes("tea") || q.includes("kitchen")) {
    return `The kettle is kept on the left burner on the stove. Rosa Alvarez, your neighbor, checked on it during her visit and made sure it's right where you like it.`;
  }

  // Dog / Pet / Maple queries
  if (q.includes("dog") || q.includes("pet") || q.includes("maple")) {
    return `Maple is Sarah's golden retriever! He's very gentle and friendly, and Sarah often shares sweet stories about him playing and stealing socks.`;
  }

  // Family / Who visits queries
  if (q.includes("family") || q.includes("who are") || q.includes("who is everyone") || q.includes("people")) {
    return `You have wonderful people around you, ${patientName}:\n• Sarah Chen — your daughter, who visits on Sundays and lives in Seattle\n• Michael Brooks — your son, who lives nearby and brings warm soup\n• James Hale — your grandson, who studies architecture and plays guitar\n• Rosa Alvarez — your neighbor, who walks with you on Tuesdays`;
  }

  // Direct Person query
  if (matchedPeople.length > 0) {
    const person = matchedPeople[0];
    const topMem = ranked.find((r) => r.personName === person.name);
    let extra = topMem ? ` ${topMem.content}` : "";
    if (person.notes && !extra) extra = ` ${person.notes}`;
    return `This is ${person.name}, your ${person.relationship.toLowerCase()}.${extra} You are always safe and loved.`;
  }

  // Top ranked memory
  if (ranked.length > 0 && ranked[0].score > 0.12) {
    const top = ranked[0];
    return `Here is what I remember: ${top.content}. Everything is peaceful and well.`;
  }

  // Gentle fallback
  return `Hello ${patientName}. You are home and safe. Sarah, Michael, James, and Rosa are all close by and looking out for you. Is there someone specific you'd like to remember?`;
}

function generateFollowUps(query: string, matchedPeople: ReturnType<typeof serializePerson>[]): string[] {
  if (matchedPeople.length > 0) {
    const name = matchedPeople[0].name.split(" ")[0];
    return [
      `When did ${name} last visit?`,
      `What did ${name} talk about?`,
      "Who else visited recently?",
    ];
  }

  const q = query.toLowerCase();
  if (q.includes("med") || q.includes("doctor")) {
    return ["When is my next doctor appointment?", "Who is Dr. Amira Patel?", "Where is my breakfast?"];
  }

  return [
    "Who is Sarah?",
    "When did Michael visit?",
    "Where is the tea kettle?",
    "What medicine do I take?",
  ];
}
