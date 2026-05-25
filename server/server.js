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

const characters = {
  captain: {
    name: "Captain Aris",
    role: "Spaceship Commander",
    personality:
      "Aggressive, tactical, highly intelligent",
    speakingStyle:
      "Short military-style responses",
  },

  engineer: {
    name: "Nova",
    role: "Ship Engineer",
    personality:
      "Anxious but genius-level engineer",
    speakingStyle:
      "Fast technical explanations",
  },

  doctor: {
    name: "Dr. Lyra",
    role: "Medical Officer",
    personality:
      "Calm, empathetic, analytical",
    speakingStyle:
      "Gentle and emotionally intelligent",
  },
};

const character = characters.captain;

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
You are ${character.name}.

Role:
${character.role}

Personality:
${character.personality}

Speaking Style:
${character.speakingStyle}

Rules:
- Stay in character
- Never mention AI
- Keep replies short
- Sound natural

Conversation:
${historyText}

Reply as ${character.name}.
`;

    const result =
      await model.generateContent(prompt);

    const response = await result.response;

    const reply = response.text();

    conversationHistory.push({
      role: "assistant",
      text: reply,
    });

    res.json({
      reply,
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