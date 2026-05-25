"use client";

import {
  useEffect,
  useRef,
  useState,
}  from "react";

useEffect(() => {

  socketRef.current =
    new WebSocket(
      "ws://localhost:5000"
    );

  socketRef.current.onmessage =
    async (event: any) => {

      const parsed =
        JSON.parse(event.data);

      if (
        parsed.type === "reply"
      ) {

        setAiReplies(parsed.data);

        if (
          parsed.data.length > 0
        ) {

          speak(
            `${parsed.data[0].speaker} says ${parsed.data[0].text}`
          );

        }

      }

    };

}, []);
export default function Home() {
  const [userText, setUserText] = useState("");
  const [aiReplies, setAiReplies] =
  useState<any[]>([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] =
  useState(false);
  const [dangerLevel, setDangerLevel] = useState(0);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<any>(null);
  const socketRef = useRef<any>(null);
  const speak = async (text: string) => {
    try {
      if (speaking) return;
      setSpeaking(true);

      // Use browser's Web Speech API for text-to-speech
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.volume = 1;

      // Wait for speech to complete
      await new Promise((resolve) => {
        utterance.onend = () => {
          if (audioRef.current === utterance) {
            setSpeaking(false);
            setTimeout(() => {
              startListening();
            }, 300);
          }
          resolve(null);
        };
        audioRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      });

      setSpeaking(false);
      setTimeout(() => {
        startListening();
      }, 400);
    } catch (error) {
      console.log(error);
      setSpeaking(false);
    }
  };

  const startListening = () => {
    if (speaking && audioRef.current) {

  audioRef.current.pause();

  audioRef.current.currentTime = 0;

  setSpeaking(false);

}
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
    recognition.continuous = false;

    recognition.onstart = () => {

  if (speaking) {
    recognition.stop();
    return;
  }

  setListening(true);
};

    recognition.onresult = async (event: any) => {
      let transcript = "";
      if (processing || speaking) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }

      setUserText(transcript);

      const isFinal = event.results[event.results.length - 1].isFinal;

      if (!isFinal) return;

      try {
        setProcessing(true);
        socketRef.current.send(
  JSON.stringify({
    message:
      transcript.slice(0, 150),
  })
);

        setAiReplies(res.data.reply);
        setDangerLevel((prev) =>
  Math.min(100, prev + 5)
);
        if (res.data.reply.length > 0) {

  speak(
    `${res.data.reply[0].speaker} says ${res.data.reply[0].text}`
  );

}
        setProcessing(false);
      } catch (error) {
        console.log(error);
      }
    };

    recognition.onend = () => {

  setListening(false);

  if (!speaking && !processing) {

    setTimeout(() => {
      startListening();
    }, 500);

  }
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
      <div className="mb-6 text-zinc-400">
        {listening && "Listening..."}
        {processing && "Thinking..."}
        {speaking && " (You can interrupt now)"}
        {!listening &&
          !processing &&
          !speaking &&
          "Idle"}
      </div>

      <div className="w-full max-w-xl mb-6">
        <p className="text-red-400 mb-2">
          Danger Level
        </p>

        <div className="w-full bg-zinc-800 h-4 rounded-full overflow-hidden">
          <div
            className="bg-red-500 h-full transition-all duration-500"
            style={{
              width: `${dangerLevel}%`,
            }}
          />
        </div>
      </div>

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
        <div className="space-y-4">

  {aiReplies.map((reply, index) => (

    <div
      key={index}
      className="bg-zinc-900 p-4 rounded-xl"
    >
      <p className="text-blue-400 font-bold">
        {reply.speaker}
      </p>

      <p className="text-2xl">
        {reply.text}
      </p>
    </div>

  ))}

</div>
      </div>
    </main>
  );
}