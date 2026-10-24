"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatWhen, relativeTime } from "@/lib/time";
import type { Conversation, Person } from "@/lib/types";

type VisitRow = {
  id: string;
  personName: string;
  relationship: string;
  avatarUrl: string | null;
  startedAt: string;
  greeting: string | null;
};

export function CaregiverBoard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [visits, setVisits] = useState<VisitRow[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [live, setLive] = useState("Waiting for the living room…");

  useEffect(() => {
    async function load() {
      const [peopleRes, visitRes, conversationRes] = await Promise.all([
        fetch("/api/people"),
        fetch("/api/visits"),
        fetch("/api/conversations"),
      ]);
      setPeople(((await peopleRes.json()) as { people: Person[] }).people);
      setVisits(((await visitRes.json()) as { visits: VisitRow[] }).visits);
      setConversations(((await conversationRes.json()) as { conversations: Conversation[] }).conversations);
    }
    void load();
    const source = new EventSource("/api/live");
    source.addEventListener("memory", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { reminder?: string; summary?: string };
      setLive(data.reminder || data.summary || "New memory stored");
      void load();
    });
    source.addEventListener("visit", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { greeting?: string };
      setLive(data.greeting || "Someone arrived");
      void load();
    });
    return () => source.close();
  }, []);

  const todayCount = conversations.filter(
    (conversation) => Date.now() - new Date(conversation.createdAt).getTime() < 24 * 60 * 60 * 1000,
  ).length;

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-6 md:px-8">
        <p className="text-xs uppercase tracking-[0.22em] text-[#e0b56a]">Caregiver desk</p>
        <h1 className="display mt-2 text-5xl">How the day is unfolding</h1>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {[
            { label: "People in the circle", value: String(people.length) },
            { label: "Conversations today", value: String(todayCount) },
            { label: "Last visitor", value: visits[0]?.personName ?? "—" },
            { label: "Patient", value: "Margaret" },
          ].map((card) => (
            <div key={card.label} className="glass rounded-3xl p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-[#cfc3b2]">{card.label}</p>
              <p className="display mt-2 text-3xl">{card.value}</p>
            </div>
          ))}
        </div>

        <div className="glass mt-6 rounded-3xl p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-[#8fbfb0]">Live from Whisper + Gemma</p>
          <p className="display mt-2 text-3xl leading-snug">{live}</p>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="display text-3xl">Arrivals</h2>
            <div className="mt-4 space-y-3">
              {visits.map((visit) => (
                <article key={visit.id} className="flex items-center gap-4 rounded-2xl border border-white/10 p-3">
                  <img
                    src={visit.avatarUrl ?? "/images/living-room.jpg"}
                    alt={visit.personName}
                    className="h-14 w-14 rounded-2xl object-cover"
                  />
                  <div>
                    <p className="text-lg">{visit.personName}</p>
                    <p className="text-sm text-[#cfc3b2]">
                      {visit.relationship} · {relativeTime(visit.startedAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
          <section>
            <h2 className="display text-3xl">What Gemma kept</h2>
            <div className="mt-4 space-y-3">
              {conversations.slice(0, 6).map((conversation) => (
                <article key={conversation.id} className="rounded-2xl border border-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#e0b56a]">
                    {conversation.personName ?? "Unknown"} · {formatWhen(conversation.createdAt)}
                  </p>
                  <p className="mt-2">{conversation.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
