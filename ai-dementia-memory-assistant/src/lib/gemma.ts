import { embedText } from "@/lib/embeddings";

export type GemmaPersonContext = {
  name: string;
  relationship: string;
  notes?: string;
  memories?: string[];
  lastSummary?: string;
};

export type GemmaResult = {
  summary: string;
  reminder: string;
  keyFacts: string[];
  overlayHeadline: string;
  overlaySub: string;
  engine: "gemma" | "gemma-local";
  model: string;
};

const SYSTEM_PROMPT = `You are Gemma, the memory companion inside Lumen, an assistant for a person living with dementia named Margaret.
Write with warmth, dignity, and short sentences. Never invent medical advice.
Given a live Whisper transcript and known context about the person in front of Margaret, return JSON only:
{
  "summary": "1-2 sentence recap of what was just said",
  "keyFacts": ["up to 4 durable facts worth remembering"],
  "reminder": "A spoken overlay Margaret can read in under 18 words. Include the person's name and relationship if known.",
  "overlayHeadline": "Name or 'Someone new'",
  "overlaySub": "Relationship or a gentle cue"
}
Facts should be concrete (jobs, pets, plans, places). Skip filler.`;

function fireworksModel(): string {
  return (
    process.env.FIREWORKS_GEMMA_MODEL ||
    process.env.GEMMA_MODEL ||
    "accounts/fireworks/models/gemma-7b-it"
  );
}

export async function inferWithGemma(input: {
  transcript: string;
  person?: GemmaPersonContext | null;
  patientName?: string;
}): Promise<GemmaResult> {
  const transcript = input.transcript.trim();
  const apiKey =
    process.env.FIREWORKS_API_KEY ||
    process.env.FIREWORKS_AI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (apiKey && transcript) {
    try {
      const remote = await callRemoteGemma(apiKey, input);
      if (remote) return remote;
    } catch {
      // Fall through to the on-device context engine.
    }
  }

  return localGemma(input);
}

async function callRemoteGemma(
  apiKey: string,
  input: {
    transcript: string;
    person?: GemmaPersonContext | null;
    patientName?: string;
  },
): Promise<GemmaResult | null> {
  const patientName = input.patientName ?? "Margaret";
  const user = [
    `Patient: ${patientName}`,
    input.person
      ? `Person in view: ${input.person.name} (${input.person.relationship})`
      : "Person in view: unknown",
    input.person?.notes ? `Caregiver notes: ${input.person.notes}` : "",
    input.person?.memories?.length
      ? `Known memories:\n- ${input.person.memories.slice(0, 8).join("\n- ")}`
      : "",
    input.person?.lastSummary ? `Last visit recap: ${input.person.lastSummary}` : "",
    `Whisper transcript:\n${input.transcript}`,
  ]
    .filter(Boolean)
    .join("\n");

  if (process.env.GROQ_API_KEY && apiKey === process.env.GROQ_API_KEY) {
    const json = await postChat(
      "https://api.groq.com/openai/v1/chat/completions",
      apiKey,
      process.env.GROQ_GEMMA_MODEL || "gemma2-9b-it",
      user,
    );
    return parseGemmaJson(json, "gemma", process.env.GROQ_GEMMA_MODEL || "gemma2-9b-it", input);
  }

  if (process.env.OPENROUTER_API_KEY && apiKey === process.env.OPENROUTER_API_KEY) {
    const model = process.env.OPENROUTER_GEMMA_MODEL || "google/gemma-2-9b-it";
    const json = await postChat("https://openrouter.ai/api/v1/chat/completions", apiKey, model, user);
    return parseGemmaJson(json, "gemma", model, input);
  }

  if (
    (process.env.GOOGLE_API_KEY && apiKey === process.env.GOOGLE_API_KEY) ||
    (process.env.GEMINI_API_KEY && apiKey === process.env.GEMINI_API_KEY)
  ) {
    const model = process.env.GEMINI_MODEL || "gemma-3-12b-it";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\n${user}` }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
        }),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseGemmaJson(text, "gemma", model, input);
  }

  const model = fireworksModel();
  const json = await postChat(
    "https://api.fireworks.ai/inference/v1/chat/completions",
    apiKey,
    model,
    user,
  );
  return parseGemmaJson(json, "gemma", model, input);
}

async function postChat(url: string, apiKey: string, model: string, user: string): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 400,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Gemma request failed (${response.status})`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

function parseGemmaJson(
  raw: string,
  engine: "gemma" | "gemma-local",
  model: string,
  input: { transcript: string; person?: GemmaPersonContext | null },
): GemmaResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]) as Partial<GemmaResult>;
      if (parsed.summary && parsed.reminder) {
        return {
          summary: String(parsed.summary),
          reminder: String(parsed.reminder),
          keyFacts: Array.isArray(parsed.keyFacts)
            ? parsed.keyFacts.map(String).slice(0, 4)
            : [],
          overlayHeadline: String(parsed.overlayHeadline || input.person?.name || "Someone new"),
          overlaySub: String(
            parsed.overlaySub || input.person?.relationship || "A familiar voice",
          ),
          engine,
          model,
        };
      }
    } catch {
      // Use local engine if the model returned prose.
    }
  }
  return localGemma(input);
}

export function localGemma(input: {
  transcript: string;
  person?: GemmaPersonContext | null;
}): GemmaResult {
  const transcript = input.transcript.trim();
  const facts = extractFacts(transcript);
  const person = input.person;
  const summary = summarizeTranscript(transcript, person);
  const overlayHeadline = person?.name ?? guessName(transcript) ?? "Someone nearby";
  const overlaySub = person?.relationship ?? guessRelationship(transcript) ?? "A visitor";
  const reminder = person
    ? `This is ${person.name}, your ${person.relationship.toLowerCase()}. ${leadFact(facts, person)}`
    : facts[0]
      ? `A visitor is speaking. ${facts[0]}`
      : "Someone is here with you. You are safe.";

  const keyFacts = unique([
    ...facts,
    ...(person?.memories ?? []).slice(0, 2),
  ]).slice(0, 4);

  return {
    summary,
    reminder: trimSentence(reminder, 140),
    keyFacts,
    overlayHeadline,
    overlaySub,
    engine: "gemma-local",
    model: "gemma-context-engine",
  };
}

function summarizeTranscript(transcript: string, person?: GemmaPersonContext | null): string {
  if (!transcript) {
    return person
      ? `${person.name} is here. No conversation captured yet.`
      : "No conversation captured yet.";
  }
  const sentences = splitSentences(transcript);
  const lead = sentences.slice(0, 2).join(" ");
  if (person) {
    return trimSentence(`${person.name} was talking with Margaret. ${lead}`, 220);
  }
  return trimSentence(lead || transcript, 220);
}

function extractFacts(transcript: string): string[] {
  const facts: string[] = [];
  const text = transcript.replace(/\s+/g, " ").trim();
  if (!text) return facts;

  const patterns: Array<[RegExp, (match: RegExpMatchArray) => string]> = [
    [/my name is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i, (m) => `Their name is ${title(m[1])}`],
    [/i(?:'| a)?m ([A-Z][a-z]+)(?:[,.]| and)/i, (m) => `They introduced themselves as ${title(m[1])}`],
    [/i(?:'| a)?m your ([a-z]+)/i, (m) => `They said they are your ${m[1]}`],
    [/i live in ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i, (m) => `They live in ${title(m[1])}`],
    [/i work(?: at| for)? ([^.,]{3,40})/i, (m) => `They work at ${clean(m[1])}`],
    [/new job(?: in| at)? ([^.,]{2,40})/i, (m) => `They mentioned a new job in ${clean(m[1])}`],
    [/(?:dog|cat|puppy|retriever) named ([A-Z][a-z]+)/i, (m) => `They have a pet named ${title(m[1])}`],
    [/bring(?:ing)? ([^.,]{3,40})/i, (m) => `They are bringing ${clean(m[1])}`],
    [/sunday|saturday|tomorrow|tonight|birthday/i, (m) => `They mentioned plans: "${m[0]}"`],
    [/medication|donepezil|appointment|doctor/i, () => "They talked about a health appointment or medication"],
  ];

  for (const [pattern, write] of patterns) {
    const match = text.match(pattern);
    if (match) facts.push(write(match));
  }

  if (facts.length === 0) {
    const sentences = splitSentences(text).filter((sentence) => sentence.length > 24);
    facts.push(...sentences.slice(0, 2));
  }

  return unique(facts).slice(0, 4);
}

function guessName(transcript: string): string | null {
  const match = transcript.match(/(?:i(?:'| a)?m|my name is|this is) ([A-Z][a-z]+)/);
  return match ? title(match[1]) : null;
}

function guessRelationship(transcript: string): string | null {
  const match = transcript.match(
    /your (daughter|son|grandson|granddaughter|husband|wife|neighbor|doctor|friend|nurse|sister|brother)/i,
  );
  return match ? title(match[1]) : null;
}

function leadFact(facts: string[], person: GemmaPersonContext): string {
  if (facts[0]) return facts[0];
  if (person.lastSummary) return person.lastSummary;
  if (person.memories?.[0]) return person.memories[0];
  return "You know them well.";
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key) && item.trim()) {
      seen.add(key);
      result.push(item.trim());
    }
  }
  return result;
}

function title(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim().replace(/[.,!?]+$/, "");
}

function trimSentence(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

export function memoryPayload(content: string) {
  return {
    content,
    embedding: embedText(content),
  };
}
