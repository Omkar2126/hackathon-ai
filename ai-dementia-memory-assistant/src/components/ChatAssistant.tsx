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

const DEFAULT_QUESTIONS = [
  { icon: "🌸", label: "Who is Sarah?", prompt: "Who is Sarah and how is she related to me?" },
  { icon: "☕", label: "Where is the kettle?", prompt: "Where did Rosa say the tea kettle is?" },
  { icon: "💊", label: "My medications", prompt: "What medicine do I take in the morning?" },
  { icon: "👨‍👩‍👧", label: "My family", prompt: "Who are the family members that visit me?" },
  { icon: "🐕", label: "Maple the dog", prompt: "Tell me about Maple the dog" },
];

export function ChatAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Hello Margaret! I am your Lumen memory companion. If you ever wonder who someone is, where something is, or what plans you have, just ask me anytime.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [largeText, setLargeText] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([
    "Who is Sarah?",
    "When did Michael visit?",
    "Where is the kettle?",
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll chat
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  // Setup Web Speech Recognition if available
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setInput(transcript);
            handleSend(transcript);
          }
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListen = () => {
    if (!recognitionRef.current) {
      alert("Voice speech recognition is not supported in this browser. Please type your question.");
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

  const speakText = (text: string, msgId: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speakingId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean text for speech
    const clean = text.replace(/•/g, "").replace(/\n/g, ". ");
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.88; // Slightly slower, calm cadence for dementia care
    utterance.pitch = 1.05;

    // Pick a warm English voice if available
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

    setSpeakingId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText ?? input).trim();
    if (!textToSend || loading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          patientName: "Margaret",
          history: messages.slice(-4).map((m) => ({
            role: m.sender === "user" ? "user" : "assistant",
            content: m.text,
          })),
        }),
      });

      if (!res.ok) throw new Error("Failed to get response");
      const data = await res.json();

      const assistantMsg: Message = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: data.reply || "I am right here with you, Margaret. You are safe.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        relatedPeople: data.relatedPeople,
        sources: data.sources,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      if (Array.isArray(data.suggestedFollowUps) && data.suggestedFollowUps.length > 0) {
        setFollowUps(data.suggestedFollowUps);
      }

      // Automatically speak the response softly if user used voice
      if (overrideText) {
        speakText(assistantMsg.text, assistantMsg.id);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: "You are home and safe, Margaret. Sarah, Michael, James, and Rosa are all here for you.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-full border border-[#e0b56a]/60 bg-[#16120e]/95 px-5 py-3.5 text-[#f4eee4] shadow-[0_12px_40px_rgba(0,0,0,0.65)] backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:border-[#e0b56a] hover:bg-[#201a14] active:scale-95 group"
          aria-label="Open Memory Companion Chatbot"
        >
          <span className="relative flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0b56a] opacity-75" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[#e0b56a]" />
          </span>
          <div className="flex flex-col text-left">
            <span className="text-sm font-semibold tracking-wide text-white group-hover:text-[#f7d692]">
              Ask Lumen
            </span>
            <span className="text-[11px] text-[#cfc3b2]">Memory companion</span>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#e0b56a]/15 text-[#e0b56a]">
            💬
          </span>
        </button>
      )}

      {/* Slide-in Accessible Chat Drawer / Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lumen Memory Assistant"
          className="fixed bottom-4 right-4 z-50 flex h-[620px] max-h-[90vh] w-[92vw] max-w-[440px] flex-col overflow-hidden rounded-3xl border border-[#e0b56a]/40 bg-[#14100c]/98 text-[#f4eee4] shadow-[0_24px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl transition-all animate-fade-in"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-[#1a1510] px-5 py-3.5">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full border border-[#e0b56a]/50 bg-[#e0b56a]/15 text-[#e0b56a]">
                ✨
              </span>
              <div>
                <h3 className="display text-base font-semibold leading-tight text-white">
                  Lumen Memory Guide
                </h3>
                <p className="text-[11px] text-[#cfc3b2]">
                  Gentle, easy-to-understand assistance
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Accessibility Font Size Toggle */}
              <button
                type="button"
                onClick={() => setLargeText((v) => !v)}
                title={largeText ? "Switch to standard text size" : "Switch to larger text for easier reading"}
                className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                  largeText
                    ? "bg-[#e0b56a] text-[#14100c]"
                    : "border border-white/10 bg-white/5 text-[#cfc3b2] hover:bg-white/10"
                }`}
              >
                {largeText ? "Large A+" : "Text A"}
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
                  setIsOpen(false);
                }}
                className="grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/5 text-sm text-[#cfc3b2] transition hover:bg-white/15 hover:text-white"
                aria-label="Close chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Quick Question Chips */}
          <div className="flex gap-2 overflow-x-auto border-b border-white/5 bg-[#120e0a]/80 px-4 py-2.5 scrollbar-none">
            {DEFAULT_QUESTIONS.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => handleSend(q.prompt)}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e0b56a]/30 bg-[#e0b56a]/10 px-3 py-1 text-xs text-[#f4eee4] transition hover:border-[#e0b56a] hover:bg-[#e0b56a]/20"
              >
                <span>{q.icon}</span>
                <span className="font-medium">{q.label}</span>
              </button>
            ))}
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-md ${
                    m.sender === "user"
                      ? "rounded-br-sm bg-[#e0b56a] text-[#14100c] font-medium"
                      : "rounded-bl-sm border border-white/10 bg-[#221c16]/95 text-[#f4eee4]"
                  } ${largeText ? "text-lg leading-relaxed" : "text-sm leading-normal"}`}
                >
                  <p className="whitespace-pre-line">{m.text}</p>

                  {/* Render linked Person Card if mentioned */}
                  {m.relatedPeople && m.relatedPeople.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#e0b56a]">
                        Recognized Loved One:
                      </p>
                      {m.relatedPeople.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-3 rounded-xl border border-[#e0b56a]/30 bg-[#16120e] p-2.5"
                        >
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#e0b56a]/40 bg-[#2c2217]">
                            {p.avatarUrl ? (
                              <Image
                                src={p.avatarUrl}
                                alt={p.name}
                                fill
                                sizes="44px"
                                className="object-cover"
                              />
                            ) : (
                              <span className="grid h-full w-full place-items-center text-sm font-bold text-[#e0b56a]">
                                {p.name.charAt(0)}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white truncate text-xs">
                                {p.name}
                              </span>
                              <span className="rounded-full bg-[#e0b56a]/20 px-2 py-0.5 text-[10px] text-[#e0b56a]">
                                {p.relationship}
                              </span>
                            </div>
                            {p.notes && (
                              <p className="text-[11px] text-[#cfc3b2] line-clamp-2 mt-0.5">
                                {p.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Message Footer: Timestamp & Read Aloud Audio button */}
                  <div
                    className={`mt-2 flex items-center justify-between text-[10px] ${
                      m.sender === "user" ? "text-[#4a3c2a]" : "text-[#8e8272]"
                    }`}
                  >
                    <span>{m.timestamp}</span>
                    {m.sender === "assistant" && (
                      <button
                        type="button"
                        onClick={() => speakText(m.text, m.id)}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium transition ${
                          speakingId === m.id
                            ? "bg-[#e0b56a] text-[#14100c]"
                            : "border border-white/10 bg-white/5 text-[#cfc3b2] hover:bg-white/10 hover:text-white"
                        }`}
                        title="Read this answer aloud in a calm voice"
                      >
                        <span>{speakingId === m.id ? "⏹ Stop" : "🔊 Listen"}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-[#221c16]/80 px-4 py-3 text-sm text-[#cfc3b2]">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e0b56a]" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e0b56a]" />
                </span>
                <span>Lumen is gently recalling your memories…</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Follow-up Buttons */}
          {followUps.length > 0 && !loading && (
            <div className="flex flex-wrap gap-1.5 border-t border-white/5 bg-[#17120e] px-4 py-2">
              <span className="text-[10px] text-[#8e8272] uppercase tracking-wider block w-full">
                Suggestions:
              </span>
              {followUps.slice(0, 3).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => handleSend(f)}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[#cfc3b2] transition hover:border-[#e0b56a]/50 hover:bg-[#e0b56a]/15 hover:text-white"
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {/* Input & Microphone Bar */}
          <div className="border-t border-white/10 bg-[#1a1510] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              {/* Mic Button for Voice Input */}
              <button
                type="button"
                onClick={toggleListen}
                title={isListening ? "Listening... click to stop" : "Speak your question aloud"}
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${
                  isListening
                    ? "border-red-500 bg-red-500/20 text-red-300 animate-pulse"
                    : "border-white/10 bg-white/5 text-[#cfc3b2] hover:border-[#e0b56a] hover:text-[#e0b56a]"
                }`}
                aria-label="Voice input"
              >
                {isListening ? "🔴" : "🎙️"}
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isListening ? "Listening to you..." : "Ask anything (e.g. Who is Sarah?)"}
                className="flex-1 rounded-xl border border-white/10 bg-[#0c0a08] px-3.5 py-2.5 text-sm text-white placeholder-[#786c5e] focus:border-[#e0b56a] focus:outline-none focus:ring-1 focus:ring-[#e0b56a]"
              />

              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e0b56a] font-bold text-[#14100c] transition hover:bg-[#ebd08e] disabled:opacity-40"
                aria-label="Send message"
              >
                ➔
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between px-1 text-[10px] text-[#786c5e]">
              <span>💡 Tap 🎙️ to speak or type your question</span>
              <span>Dignified & Private</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
