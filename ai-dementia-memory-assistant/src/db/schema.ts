import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  relationship: text("relationship").notNull(),
  notes: text("notes").notNull().default(""),
  avatarUrl: text("avatar_url"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const faceEmbeddings = pgTable(
  "face_embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    embedding: jsonb("embedding").$type<number[]>().notNull(),
    thumbnail: text("thumbnail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("face_embeddings_person_idx").on(table.personId)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id").references(() => people.id, { onDelete: "set null" }),
    transcript: text("transcript").notNull(),
    summary: text("summary").notNull().default(""),
    reminder: text("reminder").notNull().default(""),
    keyFacts: jsonb("key_facts").$type<string[]>().notNull().default([]),
    embedding: jsonb("embedding").$type<number[]>().notNull().default([]),
    source: text("source").notNull().default("whisper"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversations_person_idx").on(table.personId)],
);

export const memories = pgTable(
  "memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    category: text("category").notNull().default("note"),
    embedding: jsonb("embedding").$type<number[]>().notNull().default([]),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("memories_person_idx").on(table.personId)],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    greeting: text("greeting"),
  },
  (table) => [index("visits_person_idx").on(table.personId)],
);

export const peopleRelations = relations(people, ({ many }) => ({
  embeddings: many(faceEmbeddings),
  conversations: many(conversations),
  memories: many(memories),
  visits: many(visits),
}));

export const faceEmbeddingsRelations = relations(faceEmbeddings, ({ one }) => ({
  person: one(people, {
    fields: [faceEmbeddings.personId],
    references: [people.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  person: one(people, {
    fields: [conversations.personId],
    references: [people.id],
  }),
  memories: many(memories),
}));

export const memoriesRelations = relations(memories, ({ one }) => ({
  person: one(people, {
    fields: [memories.personId],
    references: [people.id],
  }),
  conversation: one(conversations, {
    fields: [memories.conversationId],
    references: [conversations.id],
  }),
}));

export const visitsRelations = relations(visits, ({ one }) => ({
  person: one(people, {
    fields: [visits.personId],
    references: [people.id],
  }),
}));
