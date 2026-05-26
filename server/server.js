import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import ollama from "ollama";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// ── Shared AI state (multi-agent + emotional system + memory window) ──────────

let conversationHistory = [];
let emotionalState = {
  dangerLevel: 20,
  trustLevel: 50,
  crewStress: 30,
  reactorStability: 100,
};

const characters = [
  {
    name: "Captain Aris",
    role: "Spaceship Commander",
    personality: "Aggressive, tactical, military leader",
    style: "Short commanding responses",
  },
  {
    name: "Nova",
    role: "Chief Engineer",
    personality: "Nervous genius engineer",
    style: "Fast technical explanations",
  },
  {
    name: "Dr. Lyra",
    role: "Medical Officer",
    personality: "Calm and empathetic",
    style: "Gentle analytical responses",
  },
];

// ── Shared prompt builder ─────────────────────────────────────────────────────

function buildPrompt(historyText) {
  return `
Simulate a cinematic spaceship crew conversation.

Characters:

Captain Aris

* aggressive commander
* tactical
* survival focused

Nova

* nervous genius engineer
* reactor specialist
* panics under stress

Dr. Lyra

* calm medical officer
* empathetic
* logical

World State:
Danger=${emotionalState.dangerLevel}
Stress=${emotionalState.crewStress}
Reactor=${emotionalState.reactorStability}

Conversation:
${historyText}

Rules:

* stay immersive
* never mention AI
* max 1 short sentence per character
* only relevant characters respond
* emotional reactions matter
* under danger characters become urgent
* return ONLY valid JSON

Format:
[
{
"speaker":"Captain Aris",
"text":"dialogue"
}
]
`;
}

// ── Helper: update emotional state based on parsed reply ─────────────────────

function updateEmotionalState(parsedReply) {
  if (!Array.isArray(parsedReply)) return;
  const speakerCount = parsedReply.length;
  emotionalState.crewStress = Math.min(100, emotionalState.crewStress + speakerCount * 3);
  emotionalState.dangerLevel = Math.min(100, emotionalState.dangerLevel + 1);
  emotionalState.reactorStability = Math.max(0, emotionalState.reactorStability - 1);
}

// ── Core Ollama generation (shared by WS + HTTP endpoints) ───────────────────

async function generateCrewResponse(userMessage) {
  conversationHistory.push({ role: "user", text: userMessage });

  // Memory window: keep last 4 exchanges
  const recentHistory = conversationHistory.slice(-4);
  const historyText = recentHistory
    .map((msg) => `${msg.role}: ${msg.text}`)
    .join("\n");

  const prompt = buildPrompt(historyText);

  const response = await ollama.chat({
    model: "llama3",
    messages: [
      {
        role: "system",
        content: "You are a cinematic multi-agent spaceship simulation.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    stream: true,
    options: {
      temperature: 0.7,
      top_p: 0.9,
      num_predict: 180,
    },
  });

  return response.stream ?? response;
}

// ─────────────────────────────────────────────────────────────────────────────
// REST: /signed-url  — secure ElevenLabs agent connection (server-side key)
// ─────────────────────────────────────────────────────────────────────────────

app.get("/signed-url", async (req, res) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!agentId || !apiKey) {
    return res.status(500).json({ error: "ELEVENLABS_AGENT_ID or ELEVENLABS_API_KEY not configured" });
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
      }
    );

    if (!response.ok) {
      const text = await response.text();
      console.error("ElevenLabs signed-url error:", text);
      return res.status(500).json({ error: "Failed to get signed URL from ElevenLabs" });
    }

    const body = await response.json();
    res.json({ signedUrl: body.signed_url });
  } catch (err) {
    console.error("signed-url fetch error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// REST: /v1/chat/completions  — OpenAI-compatible Custom LLM endpoint
// ElevenLabs calls this as the agent's LLM backend.
// Translates ElevenLabs messages → Ollama multi-agent → SSE stream back.
// ─────────────────────────────────────────────────────────────────────────────

app.post("/v1/chat/completions", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const messages = req.body.messages || [];

    // Extract the last user message from the OpenAI-format messages array
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    const userText = typeof lastUserMsg?.content === "string"
      ? lastUserMsg.content
      : Array.isArray(lastUserMsg?.content)
        ? lastUserMsg.content.map((c) => (c.text || "")).join(" ")
        : "Hello crew";

    const ollamaStream = await generateCrewResponse(userText.slice(0, 150));

    let fullText = "";
    let chunkIndex = 0;
    const completionId = `chatcmpl-${Date.now()}`;

    for await (const chunk of ollamaStream) {
      const chunkText = chunk?.message?.content ?? "";
      if (!chunkText) continue;
      fullText += chunkText;

      // Format as OpenAI Chat Completions streaming chunk
      const sseChunk = {
        id: completionId,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "llama3",
        choices: [
          {
            index: 0,
            delta: { content: chunkText },
            finish_reason: null,
          },
        ],
      };

      res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
      chunkIndex++;
    }

    // Parse and store in conversation history
    const cleanText = fullText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsedReply = [];
    try {
      parsedReply = JSON.parse(cleanText);
    } catch {
      parsedReply = [{ speaker: "Captain Aris", text: cleanText }];
    }

    conversationHistory.push({
      role: "assistant",
      text: JSON.stringify(parsedReply),
    });

    updateEmotionalState(parsedReply);

    // Send final [DONE] chunk
    const doneChunk = {
      id: completionId,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model: "llama3",
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    };
    res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("/v1/chat/completions error:", err);
    res.write(`data: ${JSON.stringify({ error: "LLM generation failed" })}\n\n`);
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket: AI backend (preserved — handles transcript → AI → stream → done)
// Used by frontend for real-time streaming UI updates alongside Speech Engine
// ─────────────────────────────────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("error", (err) => {
  console.error("WebSocketServer error:", err?.message || err);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.on("message", async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      const message = parsed.message;

      const ollamaStream = await generateCrewResponse(message);

      let fullText = "";

      for await (const chunk of ollamaStream) {
        const chunkText = chunk?.message?.content ?? "";
        if (!chunkText) continue;
        fullText += chunkText;
        ws.send(JSON.stringify({ type: "stream", chunk: chunkText }));
      }

      const cleanText = fullText
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      let parsedReply = [];
      try {
        parsedReply = JSON.parse(cleanText);
      } catch {
        parsedReply = [{ speaker: "Captain Aris", text: cleanText }];
      }

      conversationHistory.push({
        role: "assistant",
        text: JSON.stringify(parsedReply),
      });

      updateEmotionalState(parsedReply);

      ws.send(JSON.stringify({
        type: "done",
        data: parsedReply,
        emotionalState: { ...emotionalState },
      }));
    } catch (error) {
      console.error("WS message error:", error);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    process.exit(1);
  } else {
    console.error("Server error:", err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`EchoVerse backend running on port ${PORT}`);
  console.log(`  WebSocket AI:          ws://localhost:${PORT}`);
  console.log(`  ElevenLabs Custom LLM: http://localhost:${PORT}/v1/chat/completions`);
  console.log(`  ElevenLabs Signed URL: http://localhost:${PORT}/signed-url`);
});