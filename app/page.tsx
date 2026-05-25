"use client";

import {
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";

export default function Home() {
  const [userText, setUserText] = useState("");
  const [aiReplies, setAiReplies] = useState<any[]>([]);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [dangerLevel, setDangerLevel] = useState(0);

  const particles = useMemo(() => {
    return Array.from({ length: 40 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 5,
      size: Math.random() * 4 + 2,
    }));
  }, []);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<any>(null);
  const socketRef = useRef<any>(null);

  const characterVoices: any = {
    "Captain Aris": "jUjRbhZWoMK4aDciW36V",
    Nova: "EXAVITQu4EsNXjlpc0k5",
    "Dr. Lyra": "21m00Tcm4TlvDq3XWmlC",
  };

  const speak = async (speaker: string, text: string) => {
    try {
      if (speaking) return;
      setSpeaking(true);

      const voiceId = characterVoices[speaker] || characterVoices["Captain Aris"];

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            Accept: "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_turbo_v2_5",
          }),
        }
      );

      if (!response.ok) {
        console.log("ElevenLabs request failed");
        setSpeaking(false);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onended = () => {
        if (audioRef.current === audio) {
          setSpeaking(false);
          setTimeout(() => {
            startListening();
          }, 300);
        }
      };

      audioRef.current = audio;
      await audio.play();
    } catch (error) {
      console.log(error);
      setSpeaking(false);
    }
  };

  useEffect(() => {
    socketRef.current = new WebSocket("ws://localhost:5000");

    socketRef.current.onmessage = async (event: any) => {
      const parsed = JSON.parse(event.data);

      if (parsed.type === "reply") {
        setAiReplies(parsed.data);
        setDangerLevel((prev) => Math.min(100, prev + 5));

        if (parsed.data.length > 0) {
          const speaker = parsed.data[0].speaker;
          const text = parsed.data[0].text;
          speak(speaker, text);
        }
        setProcessing(false);
      }
    };

    return () => {
      socketRef.current?.close();
    };
  }, []);

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
            message: transcript.slice(0, 150),
          })
        );
      } catch (error) {
        console.log(error);
        setProcessing(false);
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
    <main className="relative min-h-screen overflow-hidden bg-black text-white flex flex-col items-center justify-center p-8">

      <div className="absolute inset-0 overflow-hidden">

        {particles.map((p) => (
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

      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-transparent to-red-500/10" />

      <h1 className="text-6xl font-black tracking-widest mb-4 z-10">
        EchoVerse
      </h1>

      <div className="mb-6 text-cyan-300 z-10">

        {listening && "Listening..."}

        {processing && "Thinking..."}

        {speaking &&
          `Speaking as ${
            aiReplies[0]?.speaker || ""
          }...`}

        {!listening &&
          !processing &&
          !speaking &&
          "Idle"}

      </div>

      <div className="w-full max-w-xl mb-6 z-10">

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

      <button
        onClick={startListening}
        className="z-10 bg-cyan-400 hover:bg-cyan-300 text-black px-10 py-5 rounded-full text-xl font-black transition-all duration-300 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
      >
        TALK
      </button>

      <button
        onClick={() => {
          recognitionRef.current?.stop();
          setListening(false);
        }}
        className="z-10 mt-4 bg-red-500 hover:bg-red-400 px-6 py-3 rounded-xl font-bold"
      >
        STOP
      </button>

      <div className="z-10 mt-12 max-w-3xl w-full space-y-4">

        <div className="bg-zinc-900/70 border border-cyan-400/20 p-4 rounded-2xl backdrop-blur-md">

          <p className="text-cyan-400 font-bold mb-2">
            USER
          </p>

          <p className="text-xl">
            {userText}
          </p>

        </div>

        {aiReplies.map((reply, index) => (

          <div
            key={index}
            className="bg-zinc-900/70 border border-white/10 p-5 rounded-2xl backdrop-blur-md"
          >

            <p
              className={`font-black mb-2 text-lg ${
                reply.speaker === "Captain Aris"
                  ? "text-red-400"
                  : reply.speaker === "Nova"
                  ? "text-yellow-400"
                  : "text-green-400"
              }`}
            >
              {reply.speaker}
            </p>

            <p className="text-2xl leading-relaxed">
              {reply.text}
            </p>

          </div>

        ))}

      </div>

    </main>
  );
}