"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { cropAndEmbed } from "@/lib/face-embed";
import { relativeTime } from "@/lib/time";
import type { OverlayPerson, Person } from "@/lib/types";

export function PeopleBoard() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selected, setSelected] = useState<OverlayPerson | null>(null);
  const [form, setForm] = useState({ name: "", relationship: "", notes: "" });
  const [enrolling, setEnrolling] = useState<Person | null>(null);
  const [enrollStatus, setEnrollStatus] = useState("Stand in the light");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function load() {
    const response = await fetch("/api/people");
    const data = (await response.json()) as { people: Person[] };
    setPeople(data.people);
  }

  useEffect(() => {
    void load();
  }, []);

  async function openPerson(id: string) {
    const response = await fetch(`/api/people/${id}`);
    const data = (await response.json()) as { person: OverlayPerson };
    setSelected(data.person);
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", relationship: "", notes: "" });
    await load();
  }

  async function startEnroll(person: Person) {
    setEnrolling(person);
    setEnrollStatus("Look at the camera");
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

  async function captureEnroll() {
    const video = videoRef.current;
    const person = enrolling;
    if (!video || !person) return;
    const samples = [];
    for (let i = 0; i < 6; i += 1) {
      setEnrollStatus(`Capturing ${i + 1} of 6`);
      const box = {
        x: video.videoWidth * 0.28,
        y: video.videoHeight * 0.18,
        w: video.videoWidth * 0.44,
        h: video.videoHeight * 0.64,
      };
      samples.push(cropAndEmbed(video, box));
      await new Promise((resolve) => window.setTimeout(resolve, 220));
    }
    await fetch(`/api/people/${person.id}/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeddings: samples.map((sample) => sample.embedding),
        thumbnail: samples[0]?.thumbnail,
      }),
    });
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setEnrolling(null);
    setEnrollStatus("Saved");
    await load();
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-6xl px-5 pb-16 pt-6 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[#e0b56a]">The circle</p>
            <h1 className="display mt-2 text-5xl">People Margaret knows</h1>
          </div>
          <p className="max-w-sm text-sm text-[#cfc3b2]">
            Enroll a face so Lumen can rest a name, a relationship, and the last conversation over them in real time.
          </p>
        </div>

        <form onSubmit={onCreate} className="glass mt-8 grid gap-3 rounded-3xl p-5 md:grid-cols-4">
          <input
            className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none"
            placeholder="Name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none"
            placeholder="Relationship"
            value={form.relationship}
            onChange={(event) => setForm((prev) => ({ ...prev, relationship: event.target.value }))}
            required
          />
          <input
            className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 outline-none md:col-span-1"
            placeholder="A note worth keeping"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
          />
          <button type="submit" className="rounded-2xl bg-[#f4eee4] px-4 py-3 text-[#1a1612]">
            Add person
          </button>
        </form>

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <article key={person.id} className="glass overflow-hidden rounded-[28px]">
              <button type="button" className="block w-full text-left" onClick={() => void openPerson(person.id)}>
                <div className="relative h-56">
                  <img
                    src={person.avatarUrl ?? "/images/living-room.jpg"}
                    alt={person.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-xs uppercase tracking-[0.18em] text-[#e0b56a]">{person.relationship}</p>
                    <h2 className="display text-3xl">{person.name}</h2>
                  </div>
                </div>
              </button>
              <div className="space-y-3 px-5 py-4">
                <p className="text-sm text-[#cfc3b2]">{person.notes || "No notes yet."}</p>
                <p className="text-xs uppercase tracking-[0.16em] text-[#8fbfb0]">
                  Last seen {relativeTime(person.lastSeenAt)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void startEnroll(person)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-sm"
                  >
                    Enroll face
                  </button>
                  <button
                    type="button"
                    onClick={() => void openPerson(person.id)}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-sm"
                  >
                    Memories
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {selected ? (
        <aside className="fixed inset-y-0 right-0 z-30 w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#14110d] p-6">
          <button type="button" className="text-sm text-[#cfc3b2]" onClick={() => setSelected(null)}>
            Close
          </button>
          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-[#e0b56a]">{selected.relationship}</p>
          <h2 className="display mt-2 text-4xl">{selected.name}</h2>
          <p className="mt-4 text-[#d9d0c4]">{selected.notes}</p>
          <h3 className="mt-8 text-xs uppercase tracking-[0.18em] text-[#8fbfb0]">What to remember</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {(selected.keyFacts ?? []).map((fact) => (
              <li key={fact} className="rounded-2xl border border-white/10 px-3 py-2">
                {fact}
              </li>
            ))}
          </ul>
        </aside>
      ) : null}

      {enrolling ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4">
          <div className="glass w-full max-w-lg rounded-[28px] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[#e0b56a]">Enrolling {enrolling.name}</p>
            <video ref={videoRef} className="mt-4 h-64 w-full rounded-2xl object-cover" muted playsInline autoPlay />
            <p className="mt-3 text-sm text-[#cfc3b2]">{enrollStatus}</p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void captureEnroll()} className="rounded-full bg-[#f4eee4] px-4 py-2 text-[#1a1612]">
                Capture face
              </button>
              <button
                type="button"
                onClick={() => {
                  streamRef.current?.getTracks().forEach((track) => track.stop());
                  setEnrolling(null);
                }}
                className="rounded-full px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
