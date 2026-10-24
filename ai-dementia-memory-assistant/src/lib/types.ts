export type Person = {
  id: string;
  name: string;
  relationship: string;
  notes: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  memoryCount?: number;
  visitCount?: number;
};

export type Memory = {
  id: string;
  personId: string;
  content: string;
  category: string;
  conversationId: string | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  personId: string | null;
  transcript: string;
  summary: string;
  reminder: string;
  keyFacts: string[];
  source: string;
  createdAt: string;
  personName?: string | null;
};

export type Visit = {
  id: string;
  personId: string;
  startedAt: string;
  endedAt: string | null;
  greeting: string | null;
};

export type PersonContext = Person & {
  memories: Memory[];
  conversations: Conversation[];
  visits: Visit[];
};

export type RecognizeMatch = {
  index: number;
  score: number;
  person: Person | null;
};

export type OverlayPerson = {
  id: string;
  name: string;
  relationship: string;
  notes: string;
  avatarUrl: string | null;
  lastSeenAt: string | null;
  reminder: string;
  keyFacts: string[];
  lastSummary: string;
};
