"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { cropAndEmbed, iou, lerpBox, mapBoxToStage, type FaceBox } from "@/lib/face-embed";
import { formatClock, formatLongDate, relativeTime } from "@/lib/time";
import type { OverlayPerson, Person } from "@/lib/types";

type Track = {
  id: string;
  box: FaceBox;
  score: number;
  person: OverlayPerson | null;
  unknown: boolean;
  lastMatch: number;
  misses: number;
};

type Caption = { id: string; text: string; at: number };

const DEMO_SCRIPT = [
  "Hi Mom, it's Sarah.",
  "Maple already stole a sock this morning.",
  "I started that new job in Seattle — the studio has a huge window.",
  "I'll bring lemon cake on Sunday, the one you like.",
];export function LiveAssist() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const detectorRef = useRef<FaceDetectorHandle | null>(null);
  const tracksRef = useRef<Track[]>([]);
  const spokenRef = useRef<Set<string>>(new Set());
  const recognizingRef = useRef(false);
  const lastRecognizeRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<"boot" | "camera" | "demo">("boot");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [focusedTrackId, setFocusedTrackId] = useState<string | null>(null);
  const [demoScenario, setDemoScenario] = useState<"2-people" | "3-people" | "unknown">("2-people");
  const [people, setPeople] = useState<Person[]>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [status, setStatus] = useState("Warming the camera");
  const [clock, setClock] = useState(new Date());
  const [speak, setSpeak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<Track | null>(null);
  const [nameDraft, setNameDraft] = useState({ name: "", relationship: "Friend" });
  const [engine, setEngine] = useState({ whisper: "Whisper", gemma: "Gemma" });
  const [demoOverlays, setDemoOverlays] = useState<Record<string, OverlayPerson>>({});

  const loadPeople = useCallback(async () => {
    try {
      const response = await fetch("/api/people");
      if (!response.ok) return;
      const data = (await response.json()) as { people?: Person[] };
      if (Array.isArray(data?.people)) {
        setPeople(data.people);
      }
    } catch (e) {
      console.error("Failed to load people:", e);
    }
  }, []);

  useEffect(() => {
    void loadPeople();
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [loadPeople]);

  useEffect(() => {
    tracksRef.current = tracks;
  }, [tracks]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setMode("camera");
      setStatus("Multi-face tracking active");
    } catch {
      setMode("demo");
      setStatus("Demo scene · camera unavailable");
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [startCamera]);

  useEffect(() => {
    if (mode !== "camera") return;
    let cancelled = false;
    let frame = 0;

    async function bootDetector() {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const files = await vision.FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm",
        );
        const detector = await vision.FaceDetector.createFromOptions(files, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.35,
          minSuppressionThreshold: 0.3,
        });
        if (cancelled) {
          detector.close();
          return;
        }
        detectorRef.current = detector;
        setStatus("Multi-face tracking ready");
      } catch {
        try {
          const vision = await import("@mediapipe/tasks-vision");
          const files = await vision.FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm",
          );
          const detector = await vision.FaceDetector.createFromOptions(files, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            minDetectionConfidence: 0.35,
            minSuppressionThreshold: 0.3,
          });
          if (cancelled) {
            detector.close();
            return;
          }
          detectorRef.current = detector;
          setStatus("Multi-face tracking ready");
        } catch {
          setMode("demo");
          setStatus("Demo scene · tracker unavailable");
        }
      }
    }

    void bootDetector();

    let lastPaint = 0;
    const loop = (time: number) => {
      frame = window.requestAnimationFrame(loop);
      const video = videoRef.current;
      const detector = detectorRef.current;
      if (!video || !detector || video.readyState < 2) return;
      const result = detector.detectForVideo(video, time);
      const detections = (result.detections ?? [])
        .map((detection) => {
          const box = detection.boundingBox;
          if (!box) return null;
          return {
            box: { x: box.originX, y: box.originY, w: box.width, h: box.height },
            score: detection.categories?.[0]?.score ?? 0,
          };
        })
        .filter((item): item is { box: FaceBox; score: number } => Boolean(item));

      const next = matchTracks(tracksRef.current, detections);
      tracksRef.current = next;
      if (time - lastPaint > 60) {
        lastPaint = time;
        setTracks(next);
      }

      if (time - lastRecognizeRef.current > 750 && !recognizingRef.current) {
        lastRecognizeRef.current = time;
        void recognizeTracks(video, next);
      }
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      detectorRef.current?.close();
      detectorRef.current = null;
    };
  }, [mode]);

  const recognizeTracks = useCallback(async (video: HTMLVideoElement, current: Track[]) => {
    const pending = current.filter((track) => !track.person || performance.now() - track.lastMatch > 6000);
    if (pending.length === 0) return;
    recognizingRef.current = true;
    try {
      const packed = pending.map((track) => ({
        id: track.id,
        ...cropAndEmbed(video, track.box),
      }));
      const response = await fetch("/api/recognize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeddings: packed.map((item) => item.embedding) }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        matches: Array<{ index: number; score: number; overlay: OverlayPerson | null }>;
      };
      const updated = tracksRef.current.map((track) => {
        const packedIndex = packed.findIndex((item) => item.id === track.id);
        if (packedIndex < 0) return track;
        const match = data.matches[packedIndex];
        if (match?.overlay) {
          return { ...track, person: match.overlay, unknown: false, lastMatch: performance.now() };
        }
        return { ...track, unknown: true };
      });
      tracksRef.current = updated;
      setTracks(updated);

      for (const track of updated) {
        if (track.person && !spokenRef.current.has(track.person.id)) {
          spokenRef.current.add(track.person.id);
          void fetch("/api/visits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ personId: track.person.id, greeting: track.person.reminder }),
          });
        }
      }
    } catch {
      // Keep tracking even if recognition is momentarily down.
    } finally {
      recognizingRef.current = false;
    }
  }, []);

  useEffect(() => {
    async function hydrate() {
      const chosen = people.filter(
        (person) =>
          person.name.startsWith("Sarah") ||
          person.name.startsWith("James") ||
          person.name.startsWith("Michael"),
      );
      const next: Record<string, OverlayPerson> = {};
      await Promise.all(
        chosen.map(async (person) => {
          const response = await fetch(`/api/context/${person.id}`);
          if (!response.ok) return;
          const data = (await response.json()) as { overlay: OverlayPerson };
          if (data.overlay) next[person.id] = data.overlay;
        }),
      );
      setDemoOverlays(next);
    }
    if (people.length) void hydrate();
  }, [people]);

  useEffect(() => {
    if (mode !== "demo") return;
    let frame = 0;
    let last = 0;
    const sarah = people.find((person) => person.name.startsWith("Sarah"));
    const james = people.find((person) => person.name.startsWith("James"));
    const michael = people.find((person) => person.name.startsWith("Michael"));

    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick);
      if (time - last < 80) return;
      last = time;
      const stage = stageRef.current;
      if (!stage) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const drift = Math.sin(time / 900) * 8;
      const next: Track[] = [];

      if (demoScenario === "3-people") {
        if (sarah) {
          next.push({
            id: "demo-sarah",
            box: { x: w * 0.12 + drift, y: h * 0.22, w: w * 0.17, h: h * 0.42 },
            score: 0.96,
            person: demoOverlays[sarah.id] ?? overlayFromPerson(sarah),
            unknown: false,
            lastMatch: time,
            misses: 0,
          });
        }
        if (james) {
          next.push({
            id: "demo-james",
            box: { x: w * 0.44 - drift, y: h * 0.24, w: w * 0.16, h: h * 0.40 },
            score: 0.94,
            person: demoOverlays[james.id] ?? overlayFromPerson(james),
            unknown: false,
            lastMatch: time,
            misses: 0,
          });
        }
        if (michael) {
          next.push({
            id: "demo-michael",
            box: { x: w * 0.74 + drift, y: h * 0.20, w: w * 0.17, h: h * 0.44 },
            score: 0.92,
            person: demoOverlays[michael.id] ?? overlayFromPerson(michael),
            unknown: false,
            lastMatch: time,
            misses: 0,
          });
        }
      } else if (demoScenario === "unknown") {
        if (sarah) {
          next.push({
            id: "demo-sarah",
            box: { x: w * 0.22 + drift, y: h * 0.2, w: w * 0.2, h: h * 0.46 },
            score: 0.96,
            person: demoOverlays[sarah.id] ?? overlayFromPerson(sarah),
            unknown: false,
            lastMatch: time,
            misses: 0,
          });
        }
        next.push({
          id: "demo-unknown",
          box: { x: w * 0.58 - drift, y: h * 0.24, w: w * 0.18, h: h * 0.42 },
          score: 0.88,
          person: null,
          unknown: true,
          lastMatch: time,
          misses: 0,
        });
      } else {
        // "2-people" default
        if (sarah) {
          next.push({
            id: "demo-sarah",
            box: { x: w * 0.22 + drift, y: h * 0.2, w: w * 0.2, h: h * 0.46 },
            score: 0.96,
            person: demoOverlays[sarah.id] ?? overlayFromPerson(sarah),
            unknown: false,
            lastMatch: time,
            misses: 0,
          });
        }
        if (james) {
          next.push({
            id: "demo-james",
            box: { x: w * 0.56 - drift, y: h * 0.24, w: w * 0.18, h: h * 0.42 },
            score: 0.93,
            person: demoOverlays[james.id] ?? overlayFromPerson(james),
            unknown: false,
            lastMatch: time,
            misses: 0,
          });
        }
      }
      setTracks(next);
    };
    frame = window.requestAnimationFrame(tick);

    let step = 0;
    const talk = window.setInterval(() => {
      const line = DEMO_SCRIPT[step % DEMO_SCRIPT.length];
      setCaptions((prev) => [...prev.slice(-4), { id: crypto.randomUUID(), text: line, at: Date.now() }]);
      if (step === DEMO_SCRIPT.length - 1 && sarah) {
        void rememberUtterance(DEMO_SCRIPT.join(" "), sarah.id, setBusy, setEngine);
      }
      step += 1;
    }, 2400);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(talk);
    };
  }, [mode, people, demoOverlays, demoScenario]);

  useEffect(() => {
    if (mode === "boot") return;
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    const recognition = new Speech();
    let active = true;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript.trim();
        if (event.results[i].isFinal) finalText += `${piece} `;
        else live += piece;
      }
      setInterim(live);
      if (finalText.trim()) {
        const text = finalText.trim();
        setCaptions((prev) => [...prev.slice(-5), { id: crypto.randomUUID(), text, at: Date.now() }]);
        const currentTracks = tracksRef.current;
        const focused =
          currentTracks.find((t) => t.id === focusedTrackId)?.person ??
          currentTracks.find((track) => track.person)?.person;
        void rememberUtterance(text, focused?.id ?? null, setBusy, setEngine, (reminder, personId) => {
          setTracks((prev) =>
            prev.map((track) => {
              if (!track.person || track.person.id !== personId) return track;
              return { ...track, person: { ...track.person, reminder, lastSummary: reminder } };
            }),
          );
        });
      }
    };
    recognition.onend = () => {
      if (active) {
        try {
          recognition.start();
        } catch {
          // Chrome throws if start() is called twice.
        }
      }
    };
    try {
      recognition.start();
      setListening(true);
      setStatus("Whisper is listening");
    } catch {
      setStatus("Microphone needs permission");
    }
    return () => {
      active = false;
      setListening(false);
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
    };
  }, [mode, focusedTrackId]);

  useEffect(() => {
    if (!speak) return;
    const recognized = tracks.filter((t) => t.person);
    if (recognized.length === 0) return;

    const newKeys = recognized
      .map((t) => `say-${t.person!.id}`)
      .filter((k) => !spokenRef.current.has(k));

    if (newKeys.length === 0) return;
    newKeys.forEach((k) => spokenRef.current.add(k));

    if (recognized.length >= 2 && newKeys.length >= 2) {
      const names = recognized
        .map((t) => `${t.person!.name}, your ${t.person!.relationship.toLowerCase()}`)
        .join(" and ");
      const groupUtterance = new SpeechSynthesisUtterance(`Both ${names} are in the room.`);
      groupUtterance.rate = 0.91;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(groupUtterance);
    } else {
      for (const track of recognized) {
        if (!track.person) continue;
        const key = `say-${track.person.id}`;
        if (newKeys.includes(key)) {
          const utterance = new SpeechSynthesisUtterance(track.person.reminder);
          utterance.rate = 0.92;
          window.speechSynthesis.speak(utterance);
        }
      }
    }
  }, [speak, tracks]);

  const mapped = useMemo(() => {
    const video = videoRef.current;
    const stage = stageRef.current;
    if (!stage) return [];
    if (mode === "demo" || !video) {
      return tracks.map((track) => ({ ...track, screen: track.box }));
    }
    return tracks.map((track) => ({
      ...track,
      screen: mapBoxToStage(track.box, video, stage, true),
    }));
  }, [mode, tracks]);

  // Set default focus track if none is selected
  useEffect(() => {
    if (tracks.length > 0 && !focusedTrackId) {
      const firstWithPerson = tracks.find((t) => t.person)?.id ?? tracks[0].id;
      setFocusedTrackId(firstWithPerson);
    }
  }, [tracks, focusedTrackId]);

  async function nameUnknown(targetTrack?: Track) {
    const target = targetTrack ?? naming;
    if (!target || !nameDraft.name.trim()) return;
    try {
      const create = await fetch("/api/people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameDraft.name,
          relationship: nameDraft.relationship,
        }),
      });
      if (!create.ok) {
        const text = await create.text().catch(() => "");
        console.error("Failed to create person:", create.status, text);
        return;
      }
      const created = (await create.json()) as { person: Person };
      const video = videoRef.current;
      if (video && mode === "camera" && created?.person?.id) {
        const sample = cropAndEmbed(video, target.box);
        await fetch(`/api/people/${created.person.id}/enroll`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ embedding: sample.embedding, thumbnail: sample.thumbnail }),
        });
      }
      await loadPeople();
      setNaming(null);
    } catch (err) {
      console.error("Error naming unknown face:", err);
    }
  }

  return (
    <AppShell tone="live">
      <div ref={stageRef} className="relative h-screen w-full overflow-hidden bg-black select-none">
        {mode === "demo" ? (
          <>
            <img
              src="/images/living-room.jpg"
              alt="Living room"
              className="absolute inset-0 h-full w-full object-cover transition-opacity duration-700"
            />
            {demoScenario === "3-people" ? (
              <>
                <img
                  src="/images/sarah.jpg"
                  alt="Sarah"
                  className="absolute left-[12%] top-[22%] h-[42%] w-[17%] rounded-[30px] object-cover opacity-95 shadow-2xl transition-all duration-500"
                />
                <img
                  src="/images/james.jpg"
                  alt="James"
                  className="absolute left-[44%] top-[24%] h-[40%] w-[16%] rounded-[30px] object-cover opacity-95 shadow-2xl transition-all duration-500"
                />
                <img
                  src="/images/michael.jpg"
                  alt="Michael"
                  className="absolute left-[74%] top-[20%] h-[44%] w-[17%] rounded-[30px] object-cover opacity-95 shadow-2xl transition-all duration-500"
                />
              </>
            ) : demoScenario === "unknown" ? (
              <>
                <img
                  src="/images/sarah.jpg"
                  alt="Sarah"
                  className="absolute left-[22%] top-[18%] h-[48%] w-[20%] rounded-[32px] object-cover opacity-95 shadow-2xl transition-all duration-500"
                />
                <div className="absolute left-[58%] top-[24%] h-[42%] w-[18%] rounded-[32px] bg-gradient-to-br from-neutral-800 to-neutral-950 flex flex-col items-center justify-center border border-white/20 shadow-2xl transition-all duration-500">
                  <span className="text-4xl">👤</span>
                  <span className="mt-2 text-xs uppercase tracking-widest text-[#cfc3b2]">New Visitor</span>
                </div>
              </>
            ) : (
              <>
                <img
                  src="/images/sarah.jpg"
                  alt="Sarah"
                  className="absolute left-[22%] top-[18%] h-[48%] w-[20%] rounded-[32px] object-cover opacity-95 shadow-2xl transition-all duration-500"
                />
                <img
                  src="/images/james.jpg"
                  alt="James"
                  className="absolute left-[56%] top-[22%] h-[44%] w-[18%] rounded-[32px] object-cover opacity-95 shadow-2xl transition-all duration-500"
                />
              </>
            )}
          </>
        ) : (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            muted
            playsInline
            autoPlay
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/75 pointer-events-none" />

        {/* Multi-Face Room Banner when >= 2 people are detected */}
        {mapped.length >= 2 && (
          <div className="pointer-events-auto absolute left-1/2 top-20 -translate-x-1/2 z-20 flex items-center gap-3 rounded-full border border-[#e0b56a]/35 bg-black/65 px-5 py-2 backdrop-blur-xl shadow-2xl animate-fade-in">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs uppercase tracking-[0.16em] text-[#e0b56a] font-medium whitespace-nowrap">
              {mapped.every((t) => t.person) ? "Family Present" : "People in View"} ({mapped.length}):
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {mapped.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFocusedTrackId(t.id)}
                  className={`rounded-full px-3 py-1 text-xs transition-all flex items-center gap-1.5 ${
                    focusedTrackId === t.id
                      ? "bg-[#e0b56a] text-[#1a1612] font-semibold shadow-md scale-105"
                      : "bg-white/10 hover:bg-white/20 text-[#f4eee4]"
                  }`}
                >
                  <span>{t.person ? t.person.name : "Someone new"}</span>
                  {t.person && (
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        focusedTrackId === t.id ? "text-[#1a1612]/75" : "text-[#e0b56a]"
                      }`}
                    >
                      · {t.person.relationship}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Render each face layer with smart collision avoidance */}
        {mapped.map((track) => (
          <FaceLayer
            key={track.id}
            track={track}
            isFocused={focusedTrackId === track.id || mapped.length === 1}
            isMultiFace={mapped.length > 1}
            onFocus={() => setFocusedTrackId(track.id)}
            onName={() => {
              setNaming(track);
              setNameDraft({ name: "", relationship: "Friend" });
            }}
          />
        ))}

        <div className="pointer-events-none absolute left-6 top-20 hidden md:block z-10">
          <p className="display text-4xl leading-none text-[#f4eee4]">{formatClock(clock)}</p>
          <p className="mt-2 text-sm uppercase tracking-[0.18em] text-[#cfc3b2]">{formatLongDate(clock)}</p>
          <p className="mt-3 max-w-[16rem] text-sm text-[#f4eee4]/80">Good afternoon, Margaret. You are at home.</p>
        </div>

        <div className="pointer-events-auto absolute right-6 top-20 flex flex-col items-end gap-2 z-20">
          {/* Real-time Multi-Face status pill */}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs uppercase tracking-[0.16em] backdrop-blur-xl">
            <span
              className={`h-2 w-2 rounded-full ${
                mapped.length > 0 ? "bg-emerald-400 animate-pulse" : "bg-white/30"
              }`}
            />
            <span className="text-[#f4eee4]">
              {mapped.length === 0
                ? "Searching faces"
                : mapped.length === 1
                ? "1 Face detected"
                : `${mapped.length} Faces detected`}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs uppercase tracking-[0.16em] backdrop-blur-xl">
            <span className={listening ? "pulse-dot" : "h-2 w-2 rounded-full bg-white/30"} />
            {listening ? "Listening" : "Mic off"}
          </div>

          <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-[#e0b56a] backdrop-blur-xl">
            {engine.whisper} · {engine.gemma}
          </div>

          <button
            type="button"
            onClick={() => setSpeak((value) => !value)}
            className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-[#f4eee4] backdrop-blur-xl hover:bg-black/60 transition"
          >
            {speak ? "Voice on" : "Read quietly"}
          </button>

          {mode === "demo" ? (
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-xl">
              <button
                type="button"
                onClick={() => setDemoScenario("2-people")}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  demoScenario === "2-people" ? "bg-[#e0b56a] text-[#1a1612] font-semibold" : "text-[#cfc3b2]"
                }`}
              >
                2 Faces
              </button>
              <button
                type="button"
                onClick={() => setDemoScenario("3-people")}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  demoScenario === "3-people" ? "bg-[#e0b56a] text-[#1a1612] font-semibold" : "text-[#cfc3b2]"
                }`}
              >
                3 Faces
              </button>
              <button
                type="button"
                onClick={() => setDemoScenario("unknown")}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  demoScenario === "unknown" ? "bg-[#e0b56a] text-[#1a1612] font-semibold" : "text-[#cfc3b2]"
                }`}
              >
                + Unknown
              </button>
            </div>
          ) : null}

          {mode === "camera" ? (
            <button
              type="button"
              onClick={() => {
                streamRef.current?.getTracks().forEach((track) => track.stop());
                setMode("demo");
                setStatus("Demo scene");
              }}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-[#f4eee4] backdrop-blur-xl hover:bg-black/60 transition"
            >
              Demo scene
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-[#f4eee4] backdrop-blur-xl hover:bg-black/60 transition"
            >
              Use camera
            </button>
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 pointer-events-none z-20">
          <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-end">
            <div className="glass pointer-events-auto min-h-[92px] flex-1 rounded-3xl px-5 py-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-[#e0b56a]">
                  {listening ? (
                    <span className="wave" aria-hidden>
                      <span /><span /><span /><span /><span />
                    </span>
                  ) : null}
                  Live captions
                </div>
                <span className="text-xs text-[#cfc3b2]">{busy ? "Gemma is remembering…" : status}</span>
              </div>
              <p className="display text-xl leading-snug text-[#f4eee4] md:text-2xl">
                {interim || captions.at(-1)?.text || "When someone speaks, Whisper writes it here."}
              </p>
            </div>
            <div className="glass pointer-events-auto w-full rounded-3xl px-4 py-3 md:w-72">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[#8fbfb0]">Circle</p>
              <div className="mt-2 flex -space-x-3">
                {people.slice(0, 5).map((person) => (
                  <img
                    key={person.id}
                    src={person.avatarUrl ?? "/images/living-room.jpg"}
                    alt={person.name}
                    className="h-10 w-10 rounded-full border-2 border-black/40 object-cover"
                  />
                ))}
              </div>
              <p className="mt-2 text-sm text-[#cfc3b2]">{people.length} people Lumen already knows</p>
            </div>
          </div>
        </div>

        {naming ? (
          <div className="absolute inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-md">
            <form
              className="glass w-full max-w-md rounded-3xl p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void nameUnknown();
              }}
            >
              <p className="text-xs uppercase tracking-[0.18em] text-[#e0b56a]">Enroll & Name Face</p>
              <h2 className="display mt-2 text-3xl">Someone new</h2>
              <p className="mt-1 text-sm text-[#cfc3b2]">
                Lumen will remember this person&apos;s face and help Margaret recognize them next time.
              </p>
              <input
                className="mt-5 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-[#f4eee4] outline-none focus:border-[#e0b56a]"
                placeholder="Name (e.g. Maya Brooks)"
                value={nameDraft.name}
                autoFocus
                onChange={(event) => setNameDraft((prev) => ({ ...prev, name: event.target.value }))}
              />
              <input
                className="mt-3 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-[#f4eee4] outline-none focus:border-[#e0b56a]"
                placeholder="Relationship (e.g. Granddaughter / Caregiver)"
                value={nameDraft.relationship}
                onChange={(event) => setNameDraft((prev) => ({ ...prev, relationship: event.target.value }))}
              />
              <div className="mt-5 flex gap-2">
                <button type="submit" className="rounded-full bg-[#f4eee4] px-5 py-2 text-[#1a1612] font-semibold hover:bg-white transition">
                  Remember them
                </button>
                <button type="button" className="rounded-full px-5 py-2 text-[#cfc3b2] hover:text-white transition" onClick={() => setNaming(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

function FaceLayer({
  track,
  isFocused,
  isMultiFace,
  onFocus,
  onName,
}: {
  track: Track & { screen?: FaceBox };
  isFocused: boolean;
  isMultiFace: boolean;
  onFocus: () => void;
  onName: () => void;
}) {
  const box = track.screen ?? track.box;
  const person = track.person;

  // Collision-aware position calculation
  const isRightSide = typeof window !== "undefined" ? box.x > window.innerWidth / 2 : false;
  const cardLeft = isRightSide ? Math.max(16, box.x - 304) : box.x + box.w + 14;
  const cardTop = Math.max(92, Math.min(box.y - 10, typeof window !== "undefined" ? window.innerHeight - 360 : 300));

  return (
    <>
      {/* Face Frame Box */}
      <div
        onClick={onFocus}
        className={`face-frame absolute cursor-pointer pointer-events-auto group ${
          isFocused ? "focused" : ""
        } ${person ? "" : "unknown"}`}
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
      >
        {/* Attached Face Identification Badge */}
        <div
          className={`absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-medium tracking-wide shadow-lg backdrop-blur-md transition-all ${
            person
              ? isFocused
                ? "bg-[#e0b56a] text-[#1a1612] font-semibold scale-105"
                : "bg-black/75 text-[#f4eee4] border border-[#e0b56a]/40"
              : "bg-[#d9a39a] text-[#1a1612] font-semibold"
          }`}
        >
          {person ? `${person.name} · ${person.relationship}` : "Someone new"}
        </div>
      </div>

      {/* Expanded Memory & Context Card */}
      {(isFocused || !isMultiFace) && (
        <div
          className={`overlay-card absolute z-30 pointer-events-auto animate-fade-in ${person ? "" : "unknown"}`}
          style={{ left: cardLeft, top: cardTop }}
        >
          {person ? (
            <>
              <div className="flex items-center justify-between">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#e0b56a] font-medium">{person.relationship}</p>
                {isMultiFace && (
                  <span className="text-[10px] uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    Active Focus
                  </span>
                )}
              </div>
              <h3 className="display mt-1 text-3xl leading-none">{person.name}</h3>
              <p className="mt-2 text-xs text-[#cfc3b2]">Last seen {relativeTime(person.lastSeenAt)}</p>
              <p className="mt-3 text-[14px] leading-snug text-[#f4eee4] bg-white/5 p-2.5 rounded-xl border border-white/5">
                {person.reminder}
              </p>
              <ul className="mt-3 space-y-1 text-xs text-[#d9d0c4]">
                {(person.keyFacts ?? []).slice(0, 3).map((fact) => (
                  <li key={fact} className="flex items-start gap-1.5">
                    <span className="text-[#e0b56a]">·</span>
                    <span>{fact}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#d9a39a] font-medium">New Visitor</p>
              <h3 className="display mt-1 text-3xl leading-none">Someone new</h3>
              <p className="mt-2 text-xs text-[#cfc3b2]">Lumen has not met this person yet.</p>
              <button
                type="button"
                onClick={onName}
                className="mt-4 w-full rounded-full bg-[#f4eee4] hover:bg-white px-4 py-2 text-sm text-[#1a1612] font-medium shadow-lg transition"
              >
                Name this person
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function overlayFromPerson(person: Person): OverlayPerson {
  const notes = person.notes
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    ...person,
    reminder: `This is ${person.name}, your ${person.relationship.toLowerCase()}.`,
    keyFacts: notes,
    lastSummary: person.notes,
  };
}

function matchTracks(prev: Track[], detections: Array<{ box: FaceBox; score: number }>): Track[] {
  const used = new Set<number>();
  const next: Track[] = [];
  for (const track of prev) {
    let best = -1;
    let bestScore = 0.20;
    detections.forEach((detection, index) => {
      if (used.has(index)) return;
      const score = iou(track.box, detection.box);
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best >= 0) {
      used.add(best);
      next.push({
        ...track,
        box: lerpBox(track.box, detections[best].box, 0.45),
        score: detections[best].score,
        misses: 0,
      });
    } else if (track.misses < 10) {
      next.push({ ...track, misses: track.misses + 1 });
    }
  }
  detections.forEach((detection, index) => {
    if (used.has(index)) return;
    next.push({
      id: crypto.randomUUID(),
      box: detection.box,
      score: detection.score,
      person: null,
      unknown: true,
      lastMatch: 0,
      misses: 0,
    });
  });
  return next;
}

async function rememberUtterance(
  transcript: string,
  personId: string | null,
  setBusy: (value: boolean) => void,
  setEngine: (value: { whisper: string; gemma: string }) => void,
  onReminder?: (reminder: string, personId: string) => void,
) {
  setBusy(true);
  try {
    const whisper = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    const whispered = (await whisper.json()) as { text: string; engine: string; model: string };
    const save = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: whispered.text || transcript, personId }),
    });
    const saved = (await save.json()) as {
      inference?: { reminder: string; engine: string; model: string };
    };
    setEngine({
      whisper: whispered.engine === "whisper" ? "Whisper" : "Whisper live",
      gemma: saved.inference?.engine === "gemma" ? "Gemma" : "Gemma",
    });
    if (saved.inference?.reminder && personId) onReminder?.(saved.inference.reminder, personId);
  } catch {
    // Keep the live view running if a network blip happens.
  } finally {
    setBusy(false);
  }
}

type FaceDetectorHandle = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestamp: number,
  ) => {
    detections: Array<{
      boundingBox?: { originX: number; originY: number; width: number; height: number };
      categories?: Array<{ score?: number }>;
    }>;
  };
  close: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
};
