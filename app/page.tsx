"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Conversation } from "@elevenlabs/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type AgentReply = {
  speaker: string;
  text: string;
};

type ConnectionStatus = "disconnected" | "connecting" | "connected";
type ConversationMode = "listening" | "speaking";

// ── Particle config (cinematic background) ────────────────────────────────────

const PARTICLES = [
  { id: 1, left: 10, top: 20, delay: 1, size: 4 },
  { id: 2, left: 25, top: 40, delay: 2, size: 3 },
  { id: 3, left: 50, top: 10, delay: 3, size: 5 },
  { id: 4, left: 70, top: 60, delay: 1, size: 2 },
  { id: 5, left: 85, top: 30, delay: 4, size: 4 },
  { id: 6, left: 15, top: 75, delay: 2, size: 3 },
  { id: 7, left: 40, top: 85, delay: 3, size: 5 },
  { id: 8, left: 60, top: 45, delay: 1, size: 2 },
];

// ── Character color map (cinematic UI) ────────────────────────────────────────

const SPEAKER_COLORS: Record<string, string> = {
  "Captain Aris": "text-red-400",
  Nova: "text-yellow-400",
  "Dr. Lyra": "text-green-400",
};

// ─────────────────────────────────────────────────────────────────────────────

export default function Home() {
  // ── UI state ────────────────────────────────────────────────────────────────
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [agentMode, setAgentMode] = useState<ConversationMode>("listening");
  const [userTranscript, setUserTranscript] = useState("");
  const [aiReplies, setAiReplies] = useState<AgentReply[]>([]);
  const [streamText, setStreamText] = useState("");
  const [dangerLevel, setDangerLevel] = useState(20);
  const [systemMode, setSystemMode] = useState("NORMAL");

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const conversationRef = useRef<Awaited<ReturnType<typeof Conversation.startSession>> | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // ── Derive UI labels from state ──────────────────────────────────────────────
  const statusLabel = (() => {
    if (connectionStatus === "connecting") return "Connecting...";
    if (connectionStatus === "disconnected") return "Offline";
    if (agentMode === "speaking") return `Speaking as ${aiReplies[0]?.speaker || "crew"}...`;
    return "Listening...";
  })();

  // ── WebSocket: keep real-time streaming UI + emotional state updates ─────────
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:5000");
    socketRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === "stream") {
          setStreamText((prev) => prev + parsed.chunk);
        }

        if (parsed.type === "done") {
          setAiReplies(parsed.data);
          setStreamText("");

          // Update emotional/danger system from backend
          if (parsed.emotionalState) {
            const danger = parsed.emotionalState.dangerLevel ?? 20;
            setDangerLevel(danger);
            if (danger > 70) setSystemMode("CRITICAL");
            else if (danger > 40) setSystemMode("WARNING");
            else setSystemMode("NORMAL");
          }
        }
      } catch {
        // non-JSON frame, ignore
      }
    };

    return () => {
      ws.close();
    };
  }, []);

  // ── Start ElevenLabs Speech Engine Session ───────────────────────────────────
  const startSession = useCallback(async () => {
    if (conversationRef.current) return; // already active

    try {
      setConnectionStatus("connecting");

      // Request microphone permission before connecting
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Fetch signed URL from our server (keeps API key server-side)
      const res = await fetch("http://localhost:5000/signed-url");
      if (!res.ok) throw new Error("Failed to fetch signed URL");
      const { signedUrl } = await res.json();

      const conversation = await Conversation.startSession({
        signedUrl,

        // ── Connection status callbacks ──────────────────────────────────────
        onConnect: () => {
          setConnectionStatus("connected");
        },

        onDisconnect: () => {
          setConnectionStatus("disconnected");
          conversationRef.current = null;
        },

        onError: (error: unknown) => {
          console.error("ElevenLabs Speech Engine error:", error);
          setConnectionStatus("disconnected");
          conversationRef.current = null;
        },

        // ── Mode change: listening ↔ speaking ────────────────────────────────
        onModeChange: ({ mode }: { mode: ConversationMode }) => {
          setAgentMode(mode);
        },

        // ── Message handler: user transcript + agent text ────────────────────
        // ElevenLabs fires this for both user speech (transcription)
        // and agent text (from our Custom LLM endpoint).
        onMessage: ({ message, source }: { message: string; source: string }) => {
          if (source === "user") {
            // User speech transcription from ElevenLabs STT
            setUserTranscript(message);

            // Also send to our WebSocket backend for streaming UI + emotional state
            if (socketRef.current?.readyState === WebSocket.OPEN) {
              socketRef.current.send(
                JSON.stringify({ message: message.slice(0, 150) })
              );
            }
          }

          if (source === "ai") {
            // AI response text — try to parse our JSON format for speaker display
            try {
              const parsed: AgentReply[] = JSON.parse(message);
              if (Array.isArray(parsed)) {
                setAiReplies(parsed);
              }
            } catch {
              // Plain text fallback
              setAiReplies([{ speaker: "Captain Aris", text: message }]);
            }
          }
        },
      });

      conversationRef.current = conversation;
    } catch (err) {
      console.error("Failed to start Speech Engine session:", err);
      setConnectionStatus("disconnected");
    }
  }, []);

  // ── End ElevenLabs Speech Engine Session ─────────────────────────────────────
  const endSession = useCallback(async () => {
    if (!conversationRef.current) return;
    try {
      await conversationRef.current.endSession();
    } catch (err) {
      console.error("Error ending session:", err);
    }
    conversationRef.current = null;
    setConnectionStatus("disconnected");
    setAgentMode("listening");
  }, []);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      conversationRef.current?.endSession().catch(() => {});
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER — Cinematic UI (preserved exactly, only voice controls updated)
  // ─────────────────────────────────────────────────────────────────────────────

  const isConnected = connectionStatus === "connected";
  const isConnecting = connectionStatus === "connecting";

  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white flex flex-col items-center justify-center p-8">

      {/* ── Cinematic particle background ──────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden">
        {PARTICLES.map((p) => (
          <div
            key={p.id}
            className="absolute rounded-full bg-cyan-400/20 animate-pulse"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* ── Gradient overlay ────────────────────────────────────────────────── */}
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-transparent to-red-500/10" />

      {/* ── System status badge ─────────────────────────────────────────────── */}
      <div
        className={`z-10 mb-6 px-6 py-2 rounded-full font-black tracking-widest ${
          systemMode === "CRITICAL"
            ? "bg-red-500 text-black"
            : systemMode === "WARNING"
            ? "bg-yellow-400 text-black"
            : "bg-cyan-400 text-black"
        }`}
      >
        SYSTEM STATUS: {systemMode}
      </div>

      {/* ── Title ───────────────────────────────────────────────────────────── */}
      <h1 className="text-6xl font-black tracking-widest mb-4 z-10">
        EchoVerse
      </h1>

      {/* ── Live status label ───────────────────────────────────────────────── */}
      <div className="mb-6 text-cyan-300 z-10 text-sm tracking-wide">
        {statusLabel}
      </div>

      {/* ── Danger level bar ────────────────────────────────────────────────── */}
      <div className="w-full max-w-xl mb-6 z-10">
        <p className="text-red-400 mb-2">Danger Level</p>
        <div className="w-full bg-zinc-800 h-4 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              dangerLevel > 70
                ? "bg-red-500"
                : dangerLevel > 40
                ? "bg-yellow-400"
                : "bg-cyan-400"
            }`}
            style={{ width: `${dangerLevel}%` }}
          />
        </div>
      </div>

      {/* ── Voice control buttons ───────────────────────────────────────────── */}
      <div className="z-10 flex gap-4 items-center">
        {!isConnected && !isConnecting && (
          <button
            id="btn-start-voice"
            onClick={startSession}
            className="bg-cyan-400 hover:bg-cyan-300 text-black px-10 py-5 rounded-full text-xl font-black transition-all duration-300 shadow-[0_0_40px_rgba(34,211,238,0.6)] hover:shadow-[0_0_60px_rgba(34,211,238,0.9)] active:scale-95"
          >
            TALK
          </button>
        )}

        {isConnecting && (
          <button
            id="btn-connecting"
            disabled
            className="bg-cyan-400/50 text-black px-10 py-5 rounded-full text-xl font-black cursor-not-allowed animate-pulse"
          >
            CONNECTING...
          </button>
        )}

        {isConnected && (
          <>
            {/* Pulsing mic indicator */}
            <div
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${
                agentMode === "speaking"
                  ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.8)]"
                  : "bg-cyan-400 shadow-[0_0_30px_rgba(34,211,238,0.8)] animate-pulse"
              }`}
            >
              <span className="text-2xl">
                {agentMode === "speaking" ? "🔊" : "🎙️"}
              </span>
            </div>

            <button
              id="btn-end-voice"
              onClick={endSession}
              className="bg-red-500 hover:bg-red-400 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)] active:scale-95"
            >
              END
            </button>
          </>
        )}
      </div>

      {/* ── Streaming transmission indicator ───────────────────────────────── */}
      {streamText && (
        <div className="bg-cyan-500/10 border border-cyan-400/30 p-4 rounded-2xl mb-4 z-10 max-w-3xl w-full mt-6">
          <p className="text-cyan-300 font-bold mb-2">TRANSMITTING...</p>
          <p className="text-xl whitespace-pre-wrap">{streamText}</p>
        </div>
      )}

      {/* ── Conversation display ────────────────────────────────────────────── */}
      <div className="z-10 mt-12 max-w-3xl w-full space-y-4">

        {/* User transcript */}
        <div className="bg-zinc-900/70 border border-cyan-400/20 p-4 rounded-2xl backdrop-blur-md">
          <p className="text-cyan-400 font-bold mb-2">USER</p>
          <p className="text-xl">{userTranscript}</p>
        </div>

        {/* AI crew replies */}
        {aiReplies.map((reply, index) => (
          <div
            key={index}
            className="bg-zinc-900/70 border border-white/10 p-5 rounded-2xl backdrop-blur-md"
          >
            <p
              className={`font-black mb-2 text-lg ${
                SPEAKER_COLORS[reply.speaker] ?? "text-white"
              }`}
            >
              {reply.speaker}
            </p>
            <p className="text-2xl leading-relaxed">{reply.text}</p>
          </div>
        ))}

      </div>

    </main>
  );
}