"use client";

import { useRef, useState } from "react";
import axios from "axios";

export default function Home() {
  const [userText, setUserText] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const speak = async (text: string) => {
  try {

    if (speaking) return;

    setSpeaking(true);

    const cleanedText = text
      .replace(/\\*/g, "")
      .replace(/#/g, "")
      .slice(0, 200);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/YOUR_VOICE_ID",
      {
        method: "POST",
        headers: {
          Accept: "audio/mpeg",
          "Content-Type": "application/json",
          "xi-api-key":
            process.env
              .NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: "eleven_multilingual_v2",
        }),
      }
    );

    if (!response.ok) {
      console.log(
        "ElevenLabs request failed"
      );

      setSpeaking(false);

      return;
    }

    const audioBlob =
      await response.blob();

    const audioUrl =
      URL.createObjectURL(audioBlob);

    const audio = new Audio(audioUrl);

    audio.onended = () => {
      setSpeaking(false);
    };

    await audio.play();

  } catch (error) {

    console.log(error);

    setSpeaking(false);

  }
};

  const startListening = () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech Recognition not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onstart = () => {

  if (speaking) {
    recognition.stop();
    return;
  }

  setListening(true);
};

    recognition.onresult = async (event: any) => {
      let transcript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      setUserText(transcript);

      const isFinal = event.results[event.results.length - 1].isFinal;

      if (!isFinal) return;

      try {
        const res = await axios.post("http://localhost:5000/chat", {
          message: transcript.slice(0, 150),
        });

        setAiReply(res.data.reply);
        speak(res.data.reply);
      } catch (error) {
        console.log(error);
      }
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8">
      <h1 className="text-5xl font-bold mb-10">EchoVerse</h1>

      <div className="flex gap-4">
        <button
          onClick={startListening}
          disabled={listening}
          className="bg-white text-black px-8 py-4 rounded-full text-xl font-bold hover:bg-gray-200 disabled:opacity-50"
        >
          {listening ? "Listening..." : "Start Talking"}
        </button>

        <button
          onClick={stopListening}
          disabled={!listening}
          className="bg-red-500 text-white px-6 py-4 rounded-full text-xl font-bold hover:bg-red-600 disabled:opacity-50"
        >
          Stop
        </button>
      </div>

      <div className="mt-10 max-w-2xl text-center">
        <p className="text-zinc-400 text-lg">You:</p>
        <p className="text-2xl mb-8 min-h-12">{userText}</p>

        <p className="text-zinc-400 text-lg">AI:</p>
        <p className="text-3xl font-semibold min-h-16">{aiReply}</p>
      </div>
    </main>
  );
}