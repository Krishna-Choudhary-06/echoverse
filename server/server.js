import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

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
    personality:
      "Aggressive, tactical, military leader",
    style:
      "Short commanding responses",
  },

  {
    name: "Nova",
    role: "Chief Engineer",
    personality:
      "Nervous genius engineer",
    style:
      "Fast technical explanations",
  },

  {
    name: "Dr. Lyra",
    role: "Medical Officer",
    personality:
      "Calm and empathetic",
    style:
      "Gentle analytical responses",
  },
];




const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
});
wss.on("connection", (ws) => {

  console.log("Client connected");

  ws.on("message", async (data) => {

  try {

    const parsed =
      JSON.parse(data.toString());

    const message =
      parsed.message;

    conversationHistory.push({
      role: "user",
      text: message,
    });

    const recentHistory =
      conversationHistory.slice(-4);

    const historyText =
      recentHistory
        .map(
          (msg) =>
            `${msg.role}: ${msg.text}`
        )
        .join("\n");

    const prompt = `
You are simulating multiple spaceship crew members.

${characters
  .map(
    (c) => `
Name: ${c.name}
Role: ${c.role}
Personality: ${c.personality}
Style: ${c.style}
`
  )
  .join("\n")}

Danger:
${emotionalState.dangerLevel}

Stress:
${emotionalState.crewStress}

Reactor Stability:
${emotionalState.reactorStability}

Conversation:
${historyText}

Reply in JSON array format.
`;

    const result =
      await model.generateContentStream(
        prompt
      );

    let fullText = "";

    for await (
      const chunk of result.stream
    ) {

      const chunkText =
        chunk.text();

      fullText += chunkText;

      ws.send(
        JSON.stringify({
          type: "stream",
          chunk: chunkText,
        })
      );

    }

    fullText = fullText
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsedReply = [];

    try {

      parsedReply =
        JSON.parse(fullText);

    } catch {

      parsedReply = [
        {
          speaker:
            "Captain Aris",
          text: fullText,
        },
      ];

    }

    conversationHistory.push({
      role: "assistant",
      text: JSON.stringify(
        parsedReply
      ),
    });

    ws.send(
      JSON.stringify({
        type: "done",
        data: parsedReply,
      })
    );

  } catch (error) {

    console.log(error);

  }

});
server.listen(5000, () => {
  console.log(
    "WebSocket server running on port 5000"
  );
});