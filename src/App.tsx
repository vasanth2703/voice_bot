import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "model";
  text: string;
  time: string;
  isToolCall?: boolean;
}

interface ChatLog {
  id: number;
  question: string;
  answer: string;
  timestamp: string;
}

interface Booking {
  id: number;
  name: string;
  email: string;
  booking_time: string;
  purpose: string;
  timestamp: string;
}

function App() {
  const [question, setQuestion] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "Hi, I am Vasanthakumar's RAG-grounded AI representative! I have full access to his resume, project details, and GitHub repositories. Feel free to ask me anything about his technical stacks, design tradeoffs, or work history. You can also ask to check his availability and book a call directly from here. Try asking a question or clicking a chip below!",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [history, setHistory] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [error, setError] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>("");

  // D1 Logs Dashboard State
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [activeTab, setActiveTab] = useState<"logs" | "bookings">("logs");
  const [dbStatus, setDbStatus] = useState("Connected");

  // Booking Form State
  const [bookName, setBookName] = useState("");
  const [bookEmail, setBookEmail] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookTime, setBookTime] = useState("");
  const [bookPurpose, setBookPurpose] = useState("");
  const [bookLoading, setBookLoading] = useState(false);
  const [bookMessage, setBookMessage] = useState("");

  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const askBotRef = useRef<any>(null);

  // Auto Scroll Chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Fetch D1 Logs & Bookings
  const fetchD1Logs = async () => {
    try {
      const response = await fetch("/api/logs");
      if (response.ok) {
        const data = await response.json();
        setChatLogs(data.chatLogs || []);
        setBookings(data.bookings || []);
        setDbStatus("Connected");
      } else {
        setDbStatus("Error");
      }
    } catch (err) {
      console.error("Error fetching D1 logs:", err);
      setDbStatus("Disconnected");
    }
  };

  // Poll logs on load and every 8 seconds
  useEffect(() => {
    fetchD1Logs();
    const interval = setInterval(fetchD1Logs, 8000);
    return () => clearInterval(interval);
  }, []);

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
          setError("🎙️ Microphone access denied! Please allow microphone access in your browser settings.");
        } else if (event.error === "no-speech") {
          setError("🔇 No speech detected! Please try again speaking clearly.");
        } else {
          setError(`⚠️ Microphone issue (${event.error}). Please type your message instead.`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
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

  // Initialize TTS Voices
  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const allVoices = window.speechSynthesis.getVoices();
        const engVoices = allVoices.filter((v) => v.lang.startsWith("en"));
        const displayedVoices = engVoices.length > 0 ? engVoices : allVoices;
        setVoices(displayedVoices);

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

  // Trigger TTS Speak
  const speak = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();

    // Remove markdown symbols and emojis for cleaner speech audio
    const cleanText = text
      .replace(/[*_#`~[\]()]/g, "")
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
      .substring(0, 400); // Limit speech length to keep it natural

    const utterance = new SpeechSynthesisUtterance(cleanText);

    if (selectedVoice) {
      const voice = voices.find((v) => v.name === selectedVoice);
      if (voice) utterance.voice = voice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

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

  // Submit message to Gemini RAG Pipeline
  const askBot = async (textToAsk?: string) => {
    const queryText = textToAsk || question;
    if (!queryText.trim()) return;

    stopSpeaking();
    stopListening();
    setIsThinking(true);
    setError("");

    // Add user's question to display history immediately
    const userMsg: Message = {
      role: "user",
      text: queryText.trim(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);
    setQuestion("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: queryText.trim(),
          history: history
        }),
      });

      if (!response.ok) {
        throw new Error(`Server error: status ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Update local RAG history (from backend)
      if (data.history) {
        setHistory(data.history);
      }

      // Add bot's reply
      const botMsg: Message = {
        role: "model",
        text: data.reply,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMsg]);
      speak(data.reply);

      // Instantly refresh logs & bookings
      fetchD1Logs();
    } catch (err: any) {
      console.error("Chat error:", err);
      setError(err.message || "Connection failed. Please retry.");
      setMessages((prev) => [
        ...prev,
        {
          role: "model",
          text: "⚠️ I encountered an error checking my database or connecting to my API. Let's try again in a second.",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsThinking(false);
    }
  };

  askBotRef.current = askBot;

  // Handles Quick Booking Form Submission (directly sends instruction to Chat agent!)
  const handleQuickBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookName || !bookEmail || !bookDate || !bookTime) {
      setBookMessage("❌ Please fill in all required fields.");
      return;
    }

    setBookLoading(true);
    setBookMessage("");

    const formattedBookingTime = `${bookDate} ${bookTime}`;
    const instructMessage = `I want to book a call. My details are: Name: ${bookName}, Email: ${bookEmail}, Slot: ${formattedBookingTime}, Purpose: ${bookPurpose || "General Inquiry"}`;

    try {
      // Send message to chatbot, which triggers tool call
      await askBot(instructMessage);
      setBookMessage("🎉 Call booking request submitted via agent! Check chat and bookings list.");
      
      // Clear form
      setBookName("");
      setBookEmail("");
      setBookDate("");
      setBookTime("");
      setBookPurpose("");
    } catch (err: any) {
      setBookMessage("❌ Booking failed: " + err.message);
    } finally {
      setBookLoading(false);
    }
  };

  const handleChipClick = (q: string) => {
    setQuestion(q);
    askBot(q);
  };

  const clearAll = () => {
    stopSpeaking();
    stopListening();
    setQuestion("");
    setInterimTranscript("");
    setHistory([]);
    setMessages([
      {
        role: "model",
        text: "Conversation cleared. Ready to start a new chat! Ask me anything about Vasanthakumar's profile, projects, or github history.",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setError("");
  };

  // Custom Markdown Parser Function
  const renderFormattedText = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      let formatted = line;
      const isBullet = formatted.startsWith("- ");
      if (isBullet) {
        formatted = formatted.substring(2);
      }

      // Match bold pattern **text**
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts: any[] = [];
      let lastIndex = 0;
      let match;

      while ((match = boldRegex.exec(formatted)) !== null) {
        if (match.index > lastIndex) {
          parts.push(formatted.substring(lastIndex, match.index));
        }
        parts.push(
          <strong key={match.index} className="font-extrabold text-indigo-400">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      if (lastIndex < formatted.length) {
        parts.push(formatted.substring(lastIndex));
      }

      const content = parts.length > 0 ? parts : formatted;

      if (isBullet) {
        return (
          <li key={idx} className="ml-5 list-disc mb-1.5 text-slate-300">
            {content}
          </li>
        );
      }
      return (
        <p key={idx} className="mb-2.5 text-slate-300 leading-relaxed break-words">
          {content}
        </p>
      );
    });
  };

  const sampleQuestions = [
    "Why are you the right person for an AI/Robotics role?",
    "Check availability for a call on 2026-06-12",
    "Tell me about the Sana-V project architecture and tools",
    "What is the tech stack, purpose, and design tradeoffs of your EyeNav repository?",
    "Show details of your Next_education_ai_mentor_DRL_project repo and what you'd do differently",
    "Book a call: Name Vasanth, Email avk07373@gmail.com, Slot 2026-06-12 10:00"
  ];

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 md:p-8 bg-grid-pattern selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Background Glowing Blurs */}
      <div className="absolute top-1/6 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/10 animate-pulse-glow -z-10 pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-violet-600/10 animate-pulse-glow -z-10 pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 mb-6 pb-4 border-b border-slate-800/80">
        <div className="text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-semibold mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping"></span>
            Cloudflare Workers + D1 RAG Agent
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
            Vasanthakumar A
          </h1>
          <p className="text-xs md:text-sm text-slate-400">
            Interactive AI Assistant grounded in Github repositories & actual resume history.
          </p>
        </div>

        {/* Database Status Info */}
        <div className="flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-2 text-xs">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-400">Cloudflare D1:</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                dbStatus === "Connected" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                dbStatus === "Error" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                "bg-red-500/10 text-red-400 border border-red-500/20"
              }`}>
                {dbStatus}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">Database: nilzha-db</div>
          </div>
        </div>
      </header>

      {/* Main Section */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch flex-1">
        
        {/* LEFT COLUMN: Chat Interface (7/12 cols) */}
        <main className="lg:col-span-7 flex flex-col bg-slate-900/50 border border-slate-800/80 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-xl justify-between min-h-[600px]">
          
          {/* Chat Header Status & Voice Selector */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pb-3 border-b border-slate-800/60 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Agent Status:</span>
              {isListening ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse">
                  Listening...
                </span>
              ) : isThinking ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 animate-pulse">
                  Thinking...
                </span>
              ) : isSpeaking ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  Speaking...
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                  Active & Grounded
                </span>
              )}
            </div>

            {/* Voice Selector */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="voice-selector" className="text-[10px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                Voice style:
              </label>
              <select
                id="voice-selector"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="w-full sm:w-48 text-[11px] px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.replace("Microsoft", "").replace("Google", "").trim()}
                  </option>
                ))}
                {voices.length === 0 && <option>Browser Default</option>}
              </select>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 mb-4 max-h-[420px] min-h-[300px]">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold text-xs select-none ${
                  msg.role === "user" 
                    ? "bg-gradient-to-br from-indigo-500 to-pink-500 text-white" 
                    : "bg-slate-800 border border-slate-700 text-indigo-400"
                }`}>
                  {msg.role === "user" ? "U" : "VK"}
                </div>

                {/* Message Bubble */}
                <div className={`rounded-2xl p-4 text-sm ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10"
                    : "bg-slate-950/80 border border-slate-800/80 text-slate-200 rounded-tl-none shadow-sm"
                }`}>
                  <div className="space-y-1">
                    {msg.role === "model" ? (
                      renderFormattedText(msg.text)
                    ) : (
                      <p className="break-words whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                  
                  {/* Footer (Time & TTS button) */}
                  <div className="flex justify-between items-center mt-2.5 pt-1.5 border-t border-slate-800/40 text-[10px] text-slate-500">
                    <span>{msg.time}</span>
                    {msg.role === "model" && (
                      <button
                        onClick={() => speak(msg.text)}
                        className="p-1 hover:text-indigo-400 transition-colors"
                        title="Read message aloud"
                      >
                        🔊 Listen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Thinking Loader */}
            {isThinking && (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="w-8 h-8 rounded-full bg-slate-850 border border-slate-800 flex items-center justify-center text-xs text-indigo-400 font-bold shrink-0 animate-pulse">
                  VK
                </div>
                <div className="bg-slate-950/85 border border-slate-800/80 rounded-2xl rounded-tl-none p-4 shadow-sm flex flex-col gap-2">
                  <div className="flex space-x-1.5 items-center h-4">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="text-[10px] text-slate-500 italic">Accessing knowledge base & executing D1 queries...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Voice Equalizer Visualizer */}
          {(isListening || isSpeaking) && (
            <div className="flex justify-center items-center gap-1 h-6 mb-3">
              <span className="text-[10px] font-semibold text-slate-500 mr-2">
                {isListening ? "RECORDING MICROPHONE:" : "PLAYING AUDIO:"}
              </span>
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

          {error && (
            <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-3 text-center">
              {error}
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex flex-col gap-3 border-t border-slate-800/60 pt-4">
            
            {/* TextInput Field */}
            <div className="flex gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={speechSupported ? "Ask about my repos, resume, or check my calendar..." : "Type your question..."}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-300 placeholder-slate-600 transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isThinking) {
                    askBot();
                  }
                }}
              />
              
              {/* Send Button */}
              <button
                onClick={() => askBot()}
                disabled={isThinking || !question.trim()}
                className="px-4 py-2 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white shadow-md shadow-indigo-600/10 transition-all flex items-center gap-1"
              >
                Send
              </button>
            </div>

            {/* Bottom Microphone Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex gap-2">
                {speechSupported && (
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isThinking}
                    className={`px-3 py-1.5 font-bold rounded-lg transition-all ${
                      isListening
                        ? "bg-red-600 hover:bg-red-500 text-white animate-pulse"
                        : "bg-slate-800 hover:bg-slate-750 text-slate-300"
                    }`}
                  >
                    {isListening ? "🎤 Stop" : "🎤 Speak"}
                  </button>
                )}
                {isSpeaking && (
                  <button
                    onClick={stopSpeaking}
                    className="px-3 py-1.5 font-bold rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300"
                  >
                    ⏹️ Mute Bot
                  </button>
                )}
              </div>
              <button
                onClick={clearAll}
                className="px-3 py-1.5 font-bold rounded-lg border border-slate-800 hover:bg-slate-850 text-slate-400 transition-colors"
              >
                Clear Chat
              </button>
            </div>
          </div>
        </main>

        {/* RIGHT COLUMN: D1 SQL Monitor & Booking Help (5/12 cols) */}
        <aside className="lg:col-span-5 flex flex-col gap-6">
          
          {/* Box 1: SQL Monitor / Live Database Dashboard */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 shadow-lg backdrop-blur-xl flex flex-col h-[380px]">
            <div className="flex justify-between items-center border-b border-slate-850 pb-3 mb-3">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                📂 Cloudflare D1 SQL Monitor
              </h2>
              {/* Tabs */}
              <div className="flex gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setActiveTab("logs")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    activeTab === "logs" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  chat_logs
                </button>
                <button
                  onClick={() => setActiveTab("bookings")}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${
                    activeTab === "bookings" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  bookings
                </button>
              </div>
            </div>

            {/* SQL Terminal Preview */}
            <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-850 text-[10px] font-mono text-indigo-400 mb-3 select-none flex items-center gap-1">
              <span className="text-emerald-500">d1-sql&gt;</span>
              <span>
                SELECT * FROM {activeTab === "logs" ? "chat_logs" : "bookings"} ORDER BY timestamp DESC LIMIT 20;
              </span>
            </div>

            {/* Data Output */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 text-xs">
              {activeTab === "logs" ? (
                chatLogs.length === 0 ? (
                  <p className="text-slate-500 italic text-center py-8">No queries logged yet in chat_logs table.</p>
                ) : (
                  chatLogs.map((log) => (
                    <div key={log.id} className="bg-slate-950/40 border border-slate-850 rounded-xl p-3 space-y-1">
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>Query ID: #{log.id}</span>
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-indigo-300 font-semibold break-words">Q: {log.question}</p>
                      <p className="text-slate-400 line-clamp-2 break-words">A: {log.answer}</p>
                    </div>
                  ))
                )
              ) : (
                bookings.length === 0 ? (
                  <p className="text-slate-500 italic text-center py-8">No scheduled calls found in bookings table.</p>
                ) : (
                  bookings.map((b) => (
                    <div key={b.id} className="bg-slate-950/40 border border-slate-850 rounded-xl p-3 space-y-1">
                      <div className="flex justify-between text-[9px] text-slate-500">
                        <span>Booking ID: #{b.id}</span>
                        <span>{new Date(b.timestamp).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-250">
                        <span>👤 {b.name}</span>
                        <span className="text-indigo-400 font-mono text-[10px]">{b.booking_time}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 break-words">📧 {b.email}</p>
                      {b.purpose && <p className="text-[10px] text-slate-500 italic break-words">💬 {b.purpose}</p>}
                    </div>
                  ))
                )
              )}
            </div>
          </div>

          {/* Box 2: Quick Booking Assistance Form */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-5 shadow-lg backdrop-blur-xl flex flex-col">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-350 border-b border-slate-850 pb-3 mb-4 flex items-center gap-2">
              🗓️ Direct Agent Booking Assistant
            </h2>
            
            <form onSubmit={handleQuickBook} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Your Name</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={bookName}
                    onChange={(e) => setBookName(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Your Email</label>
                  <input
                    type="email"
                    required
                    placeholder="john@example.com"
                    value={bookEmail}
                    onChange={(e) => setBookEmail(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs text-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Select Date</label>
                  <input
                    type="date"
                    required
                    value={bookDate}
                    onChange={(e) => setBookDate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs text-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Timeslot</label>
                  <select
                    required
                    value={bookTime}
                    onChange={(e) => setBookTime(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs text-slate-300"
                  >
                    <option value="">Choose slot</option>
                    <option value="09:00">09:00 AM IST</option>
                    <option value="10:00">10:00 AM IST</option>
                    <option value="11:00">11:00 AM IST</option>
                    <option value="14:00">02:00 PM IST</option>
                    <option value="15:00">03:00 PM IST</option>
                    <option value="16:00">04:00 PM IST</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Purpose (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Project interview discussion"
                  value={bookPurpose}
                  onChange={(e) => setBookPurpose(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 focus:outline-none focus:border-indigo-500 text-xs text-slate-300"
                />
              </div>

              <button
                type="submit"
                disabled={bookLoading}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50 text-white font-bold text-xs shadow-lg shadow-indigo-600/10 transition-all"
              >
                {bookLoading ? "Sending booking request to Agent..." : "Submit Booking to Agent"}
              </button>

              {bookMessage && (
                <p className={`text-[10px] text-center font-semibold mt-2 ${
                  bookMessage.startsWith("❌") ? "text-red-400" : "text-emerald-400"
                }`}>
                  {bookMessage}
                </p>
              )}
            </form>
          </div>
        </aside>
      </div>

      {/* Suggested RAG Prompts chips */}
      <footer className="w-full max-w-7xl mx-auto flex flex-col items-center gap-3 mt-8 pb-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Try clicking a suggested query chip:
        </span>
        <div className="flex flex-wrap justify-center gap-2 max-w-4xl">
          {sampleQuestions.map((q) => (
            <button
              key={q}
              onClick={() => handleChipClick(q)}
              disabled={isThinking}
              className="px-3.5 py-1.5 rounded-full text-xs font-medium border border-slate-850 bg-slate-900/40 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-400 text-slate-400 transition-all duration-300 active:scale-95 disabled:pointer-events-none"
            >
              {q}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}

export default App;
