"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatWhen } from "@/lib/time";
import type { Conversation, Person } from "@/lib/types";

type MemoryRow = {
  id: string;
  personId: string;
  personName?: string;
  content: string;
  category: string;
  createdAt: string;
};

export function MemoriesBoard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; content: string; personName?: string | null; kind: string }>>(
    [],
  );
  const [form, setForm] = useState({ personId: "", content: "", category: "note" });

  async function load() {
    const [peopleRes, memoryRes, conversationRes] = await Promise.all([
      fetch("/api/people"),
      fetch("/api/memories"),
      fetch("/api/conversations"),
    ]);
    const peopleData = (await peopleRes.json()) as { people: Person[] };
    const memoryData = (await memoryRes.json()) as { memories: MemoryRow[] };
    const conversationData = (await conversationRes.json()) as { conversations: Conversation[] };
    setPeople(peopleData.people);
    setMemories(memoryData.memories);
    setConversations(conversationData.conversations);
    if (!form.personId && peopleData.people[0]) {
      setForm((prev) => ({ ...prev, personId: peopleData.people[0].id }));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = (await response.json()) as {
        results: Array<{ id: string; content: string; personName?: string | null; kind: string }>;
      };
      setResults(data.results);
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm((prev) => ({ ...prev, content: "" }));
    await load();
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-6 md:px-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[#e0b56a]">Stored as embeddings</p>
        <h1 className="display mt-2 text-5xl">Conversation memory</h1>
        <p className="mt-3 max-w-2xl text-[#cfc3b2]">
          Whisper writes what was said. Gemma keeps the durable facts. Search retrieves the closest memories when a familiar face returns.
        </p>

        <input
          className="glass mt-8 w-full rounded-full px-6 py-4 outline-none"
          placeholder="Search a name, a dog, a Sunday cake…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {results.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {results.map((result) => (
              <div key={result.id} className="rounded-2xl border border-[#e0b56a]/20 bg-[#e0b56a]/5 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#e0b56a]">
                  {result.kind} · {result.personName ?? "Unknown"}
                </p>
                <p className="mt-1 text-sm">{result.content}</p>
              </div>
            ))}
          </div>
        ) : null}

        <form onSubmit={onSave} className="glass mt-8 grid gap-3 rounded-3xl p-5 md:grid-cols-[1fr_1fr_2fr_auto]">
          <select
            className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none"
            value={form.personId}
            onChange={(event) => setForm((prev) => ({ ...prev, personId: event.target.value }))}
          >
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none"
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
          >
            <option value="note">Note</option>
            <option value="family">Family</option>
            <option value="plan">Plan</option>
            <option value="health">Health</option>
            <option value="hobby">Hobby</option>
          </select>
          <input
            className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none"
            placeholder="Add a memory Gemma should keep"
            value={form.content}
            onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            required
          />
          <button type="submit" className="rounded-2xl bg-[#f4eee4] px-4 py-3 text-[#1a1612]">
            Keep
          </button>
        </form>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section>
            <h2 className="display text-3xl">Recent conversations</h2>
            <div className="mt-4 space-y-4">
              {conversations.map((conversation) => (
                <article key={conversation.id} className="glass rounded-3xl p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#e0b56a]">
                      {conversation.personName ?? "Unknown speaker"} · {conversation.source}
                    </p>
                    <p className="text-xs text-[#cfc3b2]">{formatWhen(conversation.createdAt)}</p>
                  </div>
                  <p className="display mt-3 text-2xl leading-snug">{conversation.reminder}</p>
                  <p className="mt-3 text-sm text-[#d9d0c4]">{conversation.summary}</p>
                  <p className="mt-4 text-sm italic text-[#cfc3b2]">“{conversation.transcript}”</p>
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2 className="display text-3xl">Facts</h2>
            <div className="mt-4 space-y-3">
              {memories.map((memory) => (
                <article key={memory.id} className="rounded-2xl border border-white/10 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#8fbfb0]">
                    {memory.personName} · {memory.category}
                  </p>
                  <p className="mt-1 text-sm">{memory.content}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
