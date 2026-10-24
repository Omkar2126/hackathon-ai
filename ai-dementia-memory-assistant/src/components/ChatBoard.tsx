"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  relatedPeople?: Array<{
    id: string;
    name: string;
    relationship: string;
    avatarUrl: string | null;
    notes?: string;
  }>;
  sources?: Array<{
    content: string;
    personName?: string | null;
  }>;
};

const SUGGESTIONS = [
  { icon: "🌸", label: "Who is Sarah?", prompt: "Who is Sarah Chen and when does she visit?" },
  { icon: "🔨", label: "Who is Michael?", prompt: "Who is Michael and what did he fix recently?" },
  { icon: "☕", label: "Where is the kettle?", prompt: "Where did Rosa say the tea kettle is kept?" },
  { icon: "💊", label: "My medicine routine", prompt: "What medicine do I take with breakfast?" },
  { icon: "🎸", label: "Who is James?", prompt: "Tell me about my grandson James" },
  { icon: "🐾", label: "Tell me about Maple", prompt: "Who is Maple the golden retriever?" },
];

export function ChatBoard() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome-full",
      sender: "assistant",
      text: "Good day, Margaret! I am Lumen, your memory assistant. You are at home and safe. You can ask me anything about your loved ones, appointments, or everyday memories.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<"normal" | "large" | "huge">("normal");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "en-US";
        rec.onresult = (e: any) => {
          const text = e.results[0][0].transcript;
          if (text) {
            setInput(text);
            handleSend(text);
          }
          setIsListening(false);
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        recognitionRef.current = rec;
      }
    }
  }, []);

  const toggleListen = () => {
    if (!recognitionRef.current) {
      alert("Voice speech recognition is not supported in this browser. Please type your message.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setIsListening(false);
      }
    }
  };

  const speak = (text: string, id: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const clean = text.replace(/•/g, "").replace(/\n/g, ". ");
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.88;
    utterance.pitch = 1.05;

    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Samantha") ||
          v.name.includes("Natural") ||
          v.name.includes("Google") ||
          v.name.includes("Zira"))
    );
    if (naturalVoice) utterance.voice = naturalVoice;

    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);

    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (override?: string) => {
    const query = (override ?? input).trim();
    if (!query || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((p) => [...p, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: query,
          patientName: "Margaret",
          history: messages.slice(-4).map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          })),
        }),
      });

      if (!res.ok) throw new Error("Error fetching response");
      const data = await res.json();

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: data.reply || "You are safe and surrounded by love, Margaret.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        relatedPeople: data.relatedPeople,
        sources: data.sources,
      };

      setMessages((p) => [...p, assistantMsg]);

      if (override) {
        speak(assistantMsg.text, assistantMsg.id);
      }
    } catch {
      setMessages((p) => [
        ...p,
        {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: "You are home and safe, Margaret. Sarah, Michael, James, and Rosa are all close by and thinking of you.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const fontClasses = {
    normal: "text-base leading-relaxed",
    large: "text-xl leading-relaxed",
    huge: "text-2xl leading-loose",
  }[textSize];

  return (
    <main className="mx-auto flex h-[calc(100vh-80px)] max-w-5xl flex-col px-4 pb-6 pt-2 md:px-8">
      {/* Top Banner & Accessibility Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#16120e]/80 p-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[#e0b56a]/40 bg-[#e0b56a]/15 text-lg text-[#e0b56a]">
            💬
          </span>
          <div>
            <h1 className="display text-xl font-bold text-white">Lumen Memory Companion</h1>
            <p className="text-xs text-[#cfc3b2]">
              Simple, reassuring answers about your family, friends, and everyday routines
            </p>
          </div>
        </div>

        {/* Text Size Accessibility Controls */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 p-1">
          <span className="px-2 text-xs text-[#8e8272]">Text size:</span>
          {(["normal", "large", "huge"] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setTextSize(size)}
              className={`rounded-full px-3 py-1 text-xs font-semibold capitalize transition ${
                textSize === size
                  ? "bg-[#e0b56a] text-[#14100c]"
                  : "text-[#cfc3b2] hover:text-white"
              }`}
            >
              {size === "normal" ? "A" : size === "large" ? "A+" : "A++"}
            </button>
          ))}
        </div>
      </div>

      {/* Suggestion Chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => handleSend(s.prompt)}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-[#1c1611]/90 px-3.5 py-2 text-xs font-medium text-[#f4eee4] transition hover:border-[#e0b56a]/70 hover:bg-[#e0b56a]/15"
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Main Conversation Box */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-3xl border border-white/10 bg-[#120e0a]/90 p-5 shadow-2xl backdrop-blur-xl scrollbar-thin">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-3xl p-5 shadow-lg ${
                m.sender === "user"
                  ? "rounded-br-sm bg-[#e0b56a] text-[#14100c] font-medium"
                  : "rounded-bl-sm border border-white/10 bg-[#1e1812]/95 text-[#f4eee4]"
              } ${fontClasses}`}
            >
              <p className="whitespace-pre-line">{m.text}</p>

              {/* Render Recognized Person Card */}
              {m.relatedPeople && m.relatedPeople.length > 0 && (
                <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {m.relatedPeople.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3.5 rounded-2xl border border-[#e0b56a]/40 bg-[#14100c] p-3 shadow"
                    >
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-[#e0b56a]/60 bg-[#2c2217]">
                        {p.avatarUrl ? (
                          <Image
                            src={p.avatarUrl}
                            alt={p.name}
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="grid h-full w-full place-items-center text-lg font-bold text-[#e0b56a]">
                            {p.name.charAt(0)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-white truncate text-sm">{p.name}</h4>
                          <span className="rounded-full bg-[#e0b56a]/20 px-2 py-0.5 text-[11px] font-medium text-[#e0b56a]">
                            {p.relationship}
                          </span>
                        </div>
                        {p.notes && (
                          <p className="mt-1 text-xs text-[#cfc3b2] line-clamp-2">{p.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Read Aloud Button & Timestamp */}
              <div
                className={`mt-3 flex items-center justify-between text-xs ${
                  m.sender === "user" ? "text-[#4a3c2a]" : "text-[#8e8272]"
                }`}
              >
                <span>{m.timestamp}</span>
                {m.sender === "assistant" && (
                  <button
                    type="button"
                    onClick={() => speak(m.text, m.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      speakingId === m.id
                        ? "bg-[#e0b56a] text-[#14100c]"
                        : "border border-white/10 bg-white/5 text-[#cfc3b2] hover:bg-white/15 hover:text-white"
                    }`}
                  >
                    <span>{speakingId === m.id ? "⏹ Stop audio" : "🔊 Read aloud"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#1e1812]/80 p-4 text-sm text-[#cfc3b2]">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0b56a]" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-[#e0b56a]" />
            </span>
            <span className="font-medium">Lumen is recalling gentle memories for you…</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        className="mt-3 flex items-center gap-3"
      >
        <button
          type="button"
          onClick={toggleListen}
          title={isListening ? "Listening... click to stop" : "Speak to Lumen"}
          className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl border text-xl transition ${
            isListening
              ? "border-red-500 bg-red-500/25 text-red-300 animate-pulse"
              : "border-white/15 bg-[#1e1812] text-[#e0b56a] hover:border-[#e0b56a] hover:bg-[#2c2217]"
          }`}
          aria-label="Voice input button"
        >
          {isListening ? "🔴" : "🎙️"}
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? "Listening... speak now" : "Ask anything (e.g. Who is visiting this week?)"}
          className="h-14 flex-1 rounded-2xl border border-white/15 bg-[#16120e] px-5 text-base text-white placeholder-[#786c5e] focus:border-[#e0b56a] focus:outline-none focus:ring-2 focus:ring-[#e0b56a]/40"
        />

        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="h-14 shrink-0 rounded-2xl bg-[#e0b56a] px-7 font-bold text-[#14100c] transition hover:bg-[#ebd08e] disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </main>
  );
}
