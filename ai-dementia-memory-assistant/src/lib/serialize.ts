import type { Conversation, Memory, Person, Visit } from "@/lib/types";

export function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializePerson(row: {
  id: string;
  name: string;
  relationship: string;
  notes: string;
  avatarUrl: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  memoryCount?: number;
  visitCount?: number;
}): Person {
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    notes: row.notes,
    avatarUrl: row.avatarUrl,
    lastSeenAt: iso(row.lastSeenAt),
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    memoryCount: row.memoryCount,
    visitCount: row.visitCount,
  };
}

export function serializeMemory(row: {
  id: string;
  personId: string;
  content: string;
  category: string;
  conversationId: string | null;
  createdAt: Date;
}): Memory {
  return {
    id: row.id,
    personId: row.personId,
    content: row.content,
    category: row.category,
    conversationId: row.conversationId,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
  };
}

export function serializeConversation(row: {
  id: string;
  personId: string | null;
  transcript: string;
  summary: string;
  reminder: string;
  keyFacts: string[] | null;
  source: string;
  createdAt: Date;
  personName?: string | null;
}): Conversation {
  return {
    id: row.id,
    personId: row.personId,
    transcript: row.transcript,
    summary: row.summary,
    reminder: row.reminder,
    keyFacts: row.keyFacts ?? [],
    source: row.source,
    createdAt: iso(row.createdAt) ?? new Date().toISOString(),
    personName: row.personName,
  };
}

export function serializeVisit(row: {
  id: string;
  personId: string;
  startedAt: Date;
  endedAt: Date | null;
  greeting: string | null;
}): Visit {
  return {
    id: row.id,
    personId: row.personId,
    startedAt: iso(row.startedAt) ?? new Date().toISOString(),
    endedAt: iso(row.endedAt),
    greeting: row.greeting,
  };
}
