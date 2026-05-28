import { useState, useEffect, useRef } from "react";

function App() {
  const [question, setQuestion] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [botReply, setBotReply] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [error, setError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");

  const recognitionRef = useRef<any>(null);
  const askBotRef = useRef<any>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    const transcriptRef = { current: "" };

    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        setError("");
        setQuestion("");
        setInterimTranscript("");
        transcriptRef.current = "";
      };

      rec.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final) {
          setQuestion((prev) => {
            const nextText = prev + final;
            transcriptRef.current = nextText;
            return nextText;
          });
        }
        setInterimTranscript(interim);
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setError("🎙️ Microphone access denied! Please click the lock icon in your browser's address bar next to the URL and set Microphone to 'Allow'.");
        } else if (event.error === "no-speech") {
          setError("🔇 No speech detected! Please start speaking clearly within a few seconds of clicking the button, and ensure your system microphone input is active and not muted.");
        } else if (event.error === "network") {
          setError("🌐 Speech recognition network error! Your browser's speech recognition engine is blocked or offline. Please check your internet connection, or simply use the fallback text input below.");
        } else {
          setError(`⚠️ Microphone issue (${event.error}). Please verify your system recording settings or use the fallback text input.`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        
        // Auto-submit recognized speech immediately for a conversational flow
        const finalQuery = transcriptRef.current;
        if (finalQuery.trim() && askBotRef.current) {
          askBotRef.current(finalQuery);
        }
      };

      recognitionRef.current = rec;
      setSpeechSupported(true);
    } else {
      setSpeechSupported(false);
    }
  }, []);

  // Initialize Speech Synthesis Voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const allVoices = window.speechSynthesis.getVoices();
        // Filter for English voices or allow all if English isn't found
        const engVoices = allVoices.filter((v) => v.lang.startsWith("en"));
        const displayedVoices = engVoices.length > 0 ? engVoices : allVoices;
        setVoices(displayedVoices);

        // Select a premium natural English voice as default if possible
        const defaultVoice =
          displayedVoices.find(
            (v) =>
              v.name.includes("Google US English") ||
              v.name.includes("Natural") ||
              v.name.includes("Samantha") ||
              v.name.includes("Daniel")
          ) ||
          displayedVoices[0];

        if (defaultVoice) {
          setSelectedVoice(defaultVoice.name);
        }
      }
    };

    loadVoices();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Trigger TTS Text-To-Speech
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;

    // Stop speaking first
    window.speechSynthesis.cancel();

    // Remove markdown and emojis for synthesis to keep it sounding extremely clean
    const cleanText = text
      .replace(/[*_#`~[\]()]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "");

    const utterance = new SpeechSynthesisUtterance(cleanText);

    if (selectedVoice) {
      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = (e) => {
      console.error("Speech Synthesis Error:", e);
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const startListening = () => {
    if (!recognitionRef.current) return;
    stopSpeaking();
    try {
      recognitionRef.current.start();
    } catch (err) {
      console.error(err);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  // Connect to backend Cloudflare Function
  const askBot = async (textToAsk?: string) => {
    const targetQuestion = textToAsk || question;
    if (!targetQuestion.trim()) return;

    stopSpeaking();
    stopListening();
    setIsThinking(true);
    setBotReply("");
    setError("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: targetQuestion.trim() }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setBotReply(data.reply);
      speak(data.reply);
    } catch (err: any) {
      console.error("Error communicating with bot:", err);
      setError(err.message || "Failed to connect to the backend. Please check your network connection.");
    } finally {
      setIsThinking(false);
    }
  };

  // Keep askBot ref fresh
  askBotRef.current = askBot;

  const handleChipClick = (q: string) => {
    setQuestion(q);
    askBot(q);
  };

  const clearAll = () => {
    stopSpeaking();
    stopListening();
    setQuestion("");
    setInterimTranscript("");
    setBotReply("");
    setError("");
  };

  const sampleQuestions = [
    "What should we know about your life story?",
    "What’s your #1 superpower?",
    "What are the top 3 areas you’d like to grow in?",
    "What misconception do your coworkers have about you?",
    "How do you push your boundaries and limits?",
  ];

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 md:p-8 bg-grid-pattern selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Dynamic Background Glowing Orbs */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 md:w-96 h-80 md:h-96 rounded-full bg-indigo-500/10 animate-pulse-glow -z-10 pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-80 md:w-96 h-80 md:h-96 rounded-full bg-violet-500/10 animate-pulse-glow -z-10 pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-4xl flex flex-col items-center text-center mt-6 mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-sm font-medium mb-3 backdrop-blur-sm">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span>
          Personal Interview Bot
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
          Ask Me Anything
        </h1>
        <p className="text-base md:text-lg text-slate-400 mt-2 max-w-xl">
          A voice bot that answers interview-style questions as me.
        </p>
      </header>

      {/* Main Premium Glassmorphism Card */}
      <main className="w-full max-w-4xl bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-[0_0_50px_rgba(99,102,241,0.06)] backdrop-blur-xl flex flex-col gap-8 flex-1 justify-between mb-8">
        
        {/* Top: Status & Voices */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-slate-500">Status:</span>
            {isListening && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
                Listening...
              </span>
            )}
            {isThinking && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-400 border border-violet-500/20 animate-pulse">
                Thinking...
              </span>
            )}
            {isSpeaking && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Speaking...
              </span>
            )}
            {!isListening && !isThinking && !isSpeaking && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                Ready
              </span>
            )}
          </div>

          {/* Voice Selector */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label htmlFor="voice-select" className="text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
              Bot Voice:
            </label>
            <select
              id="voice-select"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              className="w-full sm:w-56 text-xs px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
              {voices.length === 0 && <option>Default Browser Voice</option>}
            </select>
          </div>
        </div>

        {/* Center Section: Circular Mic & Audio Waveform */}
        <div className="flex flex-col items-center justify-center my-6 gap-6">
          <div className="relative">
            {/* Pulsing Ripple Rings */}
            {isListening && (
              <>
                <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping opacity-75"></div>
                <div className="absolute -inset-4 rounded-full bg-red-500/10 animate-pulse"></div>
              </>
            )}
            {isSpeaking && (
              <>
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75"></div>
                <div className="absolute -inset-4 rounded-full bg-emerald-500/10 animate-pulse"></div>
              </>
            )}
            {isThinking && (
              <div className="absolute -inset-2 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
            )}

            {/* Circular Button */}
            <button
              onClick={isListening ? stopListening : startListening}
              disabled={isThinking || !speechSupported}
              className={`relative z-10 w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-xl focus:outline-none ${
                isListening
                  ? "bg-gradient-to-tr from-red-600 to-rose-500 text-white shadow-red-500/20 scale-105 hover:brightness-110"
                  : isSpeaking
                  ? "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-500/20 hover:scale-105"
                  : "bg-gradient-to-tr from-indigo-600 to-violet-500 text-white hover:scale-105 shadow-indigo-500/20 hover:brightness-110 active:scale-95"
              } disabled:opacity-50 disabled:pointer-events-none`}
              title={isListening ? "Stop listening" : "Click to speak"}
            >
              {isListening ? (
                <>
                  <svg className="w-10 h-10 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  <span className="text-[10px] uppercase font-bold tracking-wider mt-1.5">Listening</span>
                </>
              ) : isSpeaking ? (
                <>
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                  <span className="text-[10px] uppercase font-bold tracking-wider mt-1.5">Speaking</span>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span className="text-[10px] uppercase font-bold tracking-wider mt-1.5">Speak Now</span>
                </>
              )}
            </button>
          </div>

          {/* Equalizer Audio Waveform Visualization */}
          {(isListening || isSpeaking || isThinking) && (
            <div className="flex justify-center items-center h-8 transition-opacity duration-300">
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
              <div className="waveform-bar"></div>
            </div>
          )}

          {!speechSupported && (
            <div className="px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs md:text-sm text-center max-w-md">
              ⚠️ Web Speech recognition is not supported in this browser. You can still test the bot fully by typing in the fallback input below.
            </div>
          )}

          {error && (
            <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs md:text-sm text-center max-w-md">
              {error}
            </div>
          )}
        </div>

        {/* Captions / Transcript Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Question Box */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Your Question / Transcript
            </span>
            <div className="flex-1 min-h-[120px] max-h-[160px] overflow-y-auto p-4 rounded-2xl bg-slate-950/80 border border-slate-800 text-sm leading-relaxed text-slate-300">
              {question ? (
                <span>{question}</span>
              ) : interimTranscript ? (
                <span className="text-slate-500 italic">{interimTranscript}</span>
              ) : (
                <span className="text-slate-600 italic">Click Speak Now, click a sample chip, or type your question below...</span>
              )}
            </div>
          </div>

          {/* Bot Reply Box */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              My Spoken Response
            </span>
            <div className="flex-1 min-h-[120px] max-h-[160px] overflow-y-auto p-4 rounded-2xl bg-indigo-950/20 border border-indigo-900/40 text-sm leading-relaxed text-slate-200">
              {isThinking ? (
                <div className="flex items-center gap-2 text-slate-500 italic">
                  <div className="flex space-x-1">
                    <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2.5 h-2.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span>Thinking... Formulation of thoughts</span>
                </div>
              ) : botReply ? (
                <div>
                  <p>{botReply}</p>
                  {isSpeaking && (
                    <button
                      onClick={stopSpeaking}
                      className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all focus:outline-none"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Pause / Stop Audio
                    </button>
                  )}
                  {!isSpeaking && (
                    <button
                      onClick={() => speak(botReply)}
                      className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all focus:outline-none"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Replay Voice
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-slate-600 italic">Spoken reply will materialize here.</span>
              )}
            </div>
          </div>
        </div>

        {/* Fallback Text Input & Bottom Action Buttons */}
        <div className="flex flex-col gap-4 border-t border-slate-800/60 pt-6">
          {/* Fallback input field */}
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={speechSupported ? "Type question here if microphone is noisy or preferred..." : "Type question here..."}
              className="flex-1 px-4 py-3 rounded-xl bg-slate-950/80 border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-300 placeholder-slate-600 transition-all"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isThinking) {
                  askBot();
                }
              }}
            />
            <button
              onClick={() => askBot()}
              disabled={isThinking || !question.trim()}
              className="px-5 py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white shadow-lg shadow-indigo-600/10 transition-all flex items-center gap-1.5 focus:outline-none"
            >
              Ask
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={startListening}
                disabled={isListening || isThinking || !speechSupported}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors focus:outline-none"
              >
                Start Speaking
              </button>
              <button
                onClick={isListening ? stopListening : stopSpeaking}
                disabled={(!isListening && !isSpeaking) || isThinking}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:pointer-events-none transition-colors focus:outline-none"
              >
                Stop Voice
              </button>
            </div>
            <button
              onClick={clearAll}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-300 transition-colors focus:outline-none"
            >
              Clear
            </button>
          </div>
        </div>
      </main>

      {/* Sample Question Chips */}
      <footer className="w-full max-w-4xl flex flex-col items-center gap-4 mb-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Or try a recommended question chip:
        </span>
        <div className="flex flex-wrap justify-center gap-2 max-w-3xl">
          {sampleQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleChipClick(q)}
              disabled={isThinking}
              className="px-4 py-2 rounded-full text-xs font-medium border border-slate-800/80 bg-slate-900/40 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-400 text-slate-400 transition-all duration-300 active:scale-95 disabled:pointer-events-none"
            >
              {q}
            </button>
          ))}
        </div>
        
        <div className="text-[10px] text-slate-600 mt-6 text-center">
          Personal Voice Interview Bot • Deployed securely on Cloudflare Pages • Powered by Gemini 2.5 Flash
        </div>
      </footer>
    </div>
  );
}

export default App;
