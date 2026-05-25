import express from "express";
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



app.post("/chat", async (req, res) => {
  try {

    const { message } = req.body;

    conversationHistory.push({
      role: "user",
      text: message,
    });

    const recentHistory =
      conversationHistory.slice(-6);

    const historyText = recentHistory
      .map(
        (msg) =>
          `${msg.role}: ${msg.text}`
      )
      .join("\n");

    const prompt = `
You are simulating multiple spaceship crew members.

Characters:

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

Rules:
- Stay immersive
- Never mention AI
- Keep replies short
- Maximum 1 sentence each
- Only the most relevant characters should respond

Conversation:
${historyText}

Respond ONLY in this JSON format:

[
  {
    "speaker": "Character Name",
    "text": "dialogue"
  }
]
`;

    const result =
      await model.generateContent(prompt);

    const response = await result.response;

    let rawReply = response.text();

rawReply = rawReply
  .replace(/```json/g, "")
  .replace(/```/g, "")
  .trim();

let parsedReply = [];

try {

  parsedReply = JSON.parse(rawReply);

} catch {

  parsedReply = [
    {
      speaker: "Captain Aris",
      text: rawReply,
    },
  ];

}

    conversationHistory.push({
      role: "assistant",
      text: JSON.stringify(parsedReply),
    });

    res.json({
      reply: parsedReply,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      error: "Something went wrong",
    });

  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});