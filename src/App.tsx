import { useState, useEffect, useRef } from "react";

interface Message {
  role: "user" | "model";
  text: string;
  time: string;
  isToolCall?: boolean;
}

interface Booking {
  name: string;
  email: string;
  booking_time: string; // YYYY-MM-DD HH:MM
  purpose?: string;
}

function App() {
  const [question, setQuestion] = useState("");
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

  // Welcome Screen & Input Focus
  const [showWelcome, setShowWelcome] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const recognitionRef = useRef<any>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const askBotRef = useRef<any>(null);

  // Booking & Calendar State
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [selectedTime, setSelectedTime] = useState<string>(""); // HH:MM
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [bookingName, setBookingName] = useState("");
  const [bookingEmail, setBookingEmail] = useState("");
  const [bookingPurpose, setBookingPurpose] = useState("");
  const [bookingStatus, setBookingStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [bookingMessage, setBookingMessage] = useState("");

  // Auto Scroll Chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Fetch all bookings to compute frontend availability
  const fetchBookings = async () => {
    try {
      const response = await fetch("/api/logs");
      if (response.ok) {
        const data = await response.json();
        if (data.bookings) {
          setBookings(data.bookings);
        }
      }
    } catch (err) {
      console.error("Failed to fetch bookings list:", err);
    }
  };

  useEffect(() => {
    fetchBookings();
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
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setError("🎙️ Microphone access denied! Please allow microphone access in your browser settings.");
        } else if (event.error === "no-speech") {
          setError("🔇 No speech detected! Please try speaking clearly.");
        } else {
          setError(`⚠️ Microphone issue (${event.error}). Please type your message instead.`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
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

      // Re-fetch bookings in case a slot was booked via AI tool call
      fetchBookings();

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

  const handleChipClick = (q: string) => {
    setQuestion(q);
    askBot(q);
  };

  const clearAll = () => {
    stopSpeaking();
    stopListening();
    setQuestion("");
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

  // Date Formatting Helper
  const formatDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  // Check Availability logic for frontend calendar view
  const getAvailableSlots = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const day = dateObj.getDay(); // 0 is Sunday, 6 is Saturday
    
    let standardHours: string[] = [];
    if (day === 0 || day === 6) {
      // Weekends: Free all day
      standardHours = [
        "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
        "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
      ];
    } else {
      // Weekdays: Free after 7 PM IST
      standardHours = ["19:00", "20:00", "21:00", "22:00"];
    }

    // Filter out booked slots
    const bookedForDay = bookings
      .filter((b) => b.booking_time.startsWith(dateStr))
      .map((b) => b.booking_time.split(" ")[1]);

    return standardHours.filter((h) => !bookedForDay.includes(h));
  };

  // Get Calendar days grid
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  // Navigations for Calendar
  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const formatTime12h = (t24: string) => {
    const [h, m] = t24.split(":");
    const hour = parseInt(h);
    const ampm = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  };

  // Handle direct booking from sidebar
  const handleDirectBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDate || !selectedTime || !bookingName || !bookingEmail) {
      setBookingStatus("error");
      setBookingMessage("Please fill in all required fields.");
      return;
    }

    setBookingStatus("loading");
    setBookingMessage("");

    const bookingTime = `${selectedDate} ${selectedTime}`;

    try {
      const response = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: bookingName,
          email: bookingEmail,
          bookingTime,
          purpose: bookingPurpose,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setBookingStatus("success");
        setBookingMessage(`Successfully booked slot for ${formatTime12h(selectedTime)} on ${selectedDate}!`);
        // Refresh bookings
        fetchBookings();
        // Reset form
        setBookingName("");
        setBookingEmail("");
        setBookingPurpose("");
        setSelectedDate("");
        setSelectedTime("");
      } else {
        setBookingStatus("error");
        setBookingMessage(data.error || "Failed to book slot.");
      }
    } catch (err: any) {
      console.error("Booking error:", err);
      setBookingStatus("error");
      setBookingMessage("Connection error. Please try again.");
    }
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
    "Tell me about your experience self-hosting n8n servers",
    "Tell me about the Sana-V project architecture and tools",
    "What is the tech stack, purpose, and design tradeoffs of your EyeNav repository?",
    "Explain how your Unified Compliance System is designed and built"
  ];

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 md:p-8 bg-grid-pattern selection:bg-indigo-500/30 overflow-hidden">
      
      {/* Welcome Screen Overlay */}
      {showWelcome && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl text-center space-y-6 transform animate-scale-up">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center mx-auto shadow-lg shadow-indigo-500/20">
              <span className="text-3xl">🎙️</span>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-transparent">
                Talk to Vasanth's AI Agent
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Interact using your voice to hear responses, or cancel to type standard text questions.
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button
                onClick={() => {
                  setShowWelcome(false);
                  startListening();
                }}
                className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <span>🎙️ Tap to Speak</span>
              </button>
              
              <button
                onClick={() => {
                  setShowWelcome(false);
                  setTimeout(() => inputRef.current?.focus(), 100);
                }}
                className="w-full py-3 rounded-xl font-semibold text-xs border border-slate-800 hover:bg-slate-850 active:scale-[0.98] text-slate-400 hover:text-slate-200 transition-all"
              >
                Cancel to Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Background Glowing Blurs */}
      <div className="absolute top-1/6 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/10 animate-pulse-glow -z-10 pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-violet-600/10 animate-pulse-glow -z-10 pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-7xl mx-auto flex flex-col justify-center items-center text-center mb-8 pb-4 border-b border-slate-800/80">
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-violet-400 to-pink-400 bg-clip-text text-transparent mb-2">
          Vasanthakumar A
        </h1>
        <p className="text-xs md:text-sm text-slate-400">
          Interactive AI Assistant grounded in GitHub repositories & actual resume history.
        </p>
      </header>

      {/* Main Section - Two-Column Layout */}
      <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 flex-1 items-start">
        
        {/* Left Column: Chat Interface */}
        <main className="lg:col-span-8 flex flex-col bg-slate-900/50 border border-slate-800/80 rounded-3xl p-4 md:p-6 shadow-xl backdrop-blur-xl justify-between h-[650px]">
          
          {/* Chat Header Status & Voice Selector */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pb-3 border-b border-slate-800/60 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Status:</span>
              {isListening ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20 animate-pulse">
                  Listening...
                </span>
              ) : isThinking ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20 animate-pulse">
                  Searching knowledge base...
                </span>
              ) : isSpeaking ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  Speaking...
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                  Ready
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
          <div className="flex-1 overflow-y-auto pr-1 space-y-4 mb-4">
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
                  <div className="flex justify-between items-center mt-2.5 pt-1.5 border-t border-slate-800/40 text-[10px] text-slate-500 font-medium">
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
                  <span className="text-[10px] text-slate-500 italic font-medium">Searching knowledge base...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Voice Equalizer Visualizer */}
          {(isListening || isSpeaking) && (
            <div className="flex flex-col items-center justify-center gap-2 mb-3">
              <div className="flex justify-center items-center gap-1 h-6">
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
            </div>
          )}

          {error && (
            <div className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs mb-3 text-center font-medium">
              {error}
            </div>
          )}

          {/* Action Toolbar */}
          <div className="flex flex-col gap-3 border-t border-slate-800/60 pt-4">
            
            {/* TextInput Field */}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={speechSupported ? "Ask about my repos, work history, or technical experience..." : "Type your question..."}
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950/80 border border-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm text-slate-300 placeholder-slate-600 transition-all font-medium"
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
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:pointer-events-none text-white shadow-md shadow-indigo-600/10 transition-all flex items-center gap-1 shrink-0"
              >
                Send
              </button>
            </div>

            {/* Bottom Microphone Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
              <div className="flex gap-2">
                {speechSupported && (
                  <button
                    onClick={isListening ? stopListening : startListening}
                    disabled={isThinking}
                    className={`px-3.5 py-2 rounded-lg transition-all ${
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
                    className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300"
                  >
                    ⏹️ Mute Bot
                  </button>
                )}
              </div>
              <button
                onClick={clearAll}
                className="px-3.5 py-2 rounded-lg border border-slate-800 hover:bg-slate-850 text-slate-400 transition-colors"
              >
                Clear Chat
              </button>
            </div>
          </div>
        </main>

        {/* Right Column: Calendar & Booking Sidebar */}
        <aside className="lg:col-span-4 bg-slate-900/50 border border-slate-800/80 rounded-3xl p-5 md:p-6 shadow-xl backdrop-blur-xl flex flex-col space-y-4 h-[650px] overflow-y-auto">
          
          <div className="pb-3 border-b border-slate-800/60 flex items-center justify-between">
            <h2 className="text-md font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent flex items-center gap-1.5">
              <span>📅</span> Schedule a Call
            </h2>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">IST Timezone</span>
          </div>

          {/* Calendar Header Month Control */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ◀
            </button>
            <span className="text-sm font-bold text-slate-300">
              {currentMonth.toLocaleString('default', { month: 'long' })} {currentMonth.getFullYear()}
            </span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            >
              ▶
            </button>
          </div>

          {/* Calendar Days of Week Header */}
          <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-500 tracking-wider">
            <span>SU</span>
            <span>MO</span>
            <span>TU</span>
            <span>WE</span>
            <span>TH</span>
            <span>FR</span>
            <span>SA</span>
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {getDaysInMonth(currentMonth).map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }

              const formatted = formatDateStr(day);
              const todayStr = formatDateStr(new Date());
              const isPast = formatted < todayStr;
              const isSelected = formatted === selectedDate;
              const dayOfWeek = day.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

              let styleClasses = "aspect-square flex items-center justify-center text-xs rounded-lg font-bold transition-all ";
              if (isPast) {
                styleClasses += "text-slate-700 cursor-not-allowed pointer-events-none";
              } else if (isSelected) {
                styleClasses += "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400";
              } else {
                styleClasses += "hover:bg-slate-800 cursor-pointer ";
                if (isWeekend) {
                  styleClasses += "text-indigo-400 border border-indigo-500/10 bg-indigo-500/5 hover:border-indigo-500/30";
                } else {
                  styleClasses += "text-slate-300 border border-slate-850 hover:border-slate-700";
                }
              }

              return (
                <button
                  key={formatted}
                  onClick={() => {
                    setSelectedDate(formatted);
                    setSelectedTime("");
                    setBookingMessage("");
                    setBookingStatus("idle");
                  }}
                  disabled={isPast}
                  className={styleClasses}
                  title={isWeekend ? "Weekend: Free All Day" : "Weekday: Free after 7 PM"}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* Guide legend */}
          <div className="flex justify-center gap-4 text-[9px] text-slate-500 font-bold border-b border-slate-850 pb-3">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded bg-indigo-500/10 border border-indigo-500/30 block"></span>
              <span>Weekends (All Day)</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded border border-slate-800 block"></span>
              <span>Weekdays (After 7 PM)</span>
            </div>
          </div>

          {/* Timeslot Selector */}
          {selectedDate && (
            <div className="space-y-2.5 animate-fade-in">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-400">Available slots on {selectedDate}:</span>
                <span className="text-[9px] text-slate-500 italic">
                  {(new Date(selectedDate).getDay() === 0 || new Date(selectedDate).getDay() === 6) 
                    ? "Weekend (9am - 9pm)" 
                    : "Weekday (after 7pm)"}
                </span>
              </div>
              
              <div className="grid grid-cols-3 gap-1.5">
                {getAvailableSlots(selectedDate).map((time) => {
                  const isTimeSelected = time === selectedTime;
                  return (
                    <button
                      key={time}
                      onClick={() => {
                        setSelectedTime(time);
                        setBookingMessage("");
                      }}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        isTimeSelected
                          ? "bg-violet-600 border-violet-400 text-white shadow-md shadow-violet-600/20"
                          : "bg-slate-950 border-slate-850 text-slate-300 hover:bg-slate-850 hover:border-slate-700"
                      }`}
                    >
                      {formatTime12h(time)}
                    </button>
                  );
                })}
              </div>

              {getAvailableSlots(selectedDate).length === 0 && (
                <p className="text-xs text-amber-500 text-center font-medium bg-amber-500/5 border border-amber-500/10 py-2 rounded-xl">
                  ⚠️ No available slots. All times are booked on this date.
                </p>
              )}
            </div>
          )}

          {/* Booking Form Inputs */}
          {selectedDate && selectedTime && (
            <form onSubmit={handleDirectBooking} className="space-y-2.5 pt-2 border-t border-slate-850 animate-scale-up">
              <span className="text-xs font-bold text-slate-400 block mb-1">Confirm details to book:</span>
              
              <div className="space-y-2">
                <input
                  type="text"
                  required
                  placeholder="Your Full Name *"
                  value={bookingName}
                  onChange={(e) => setBookingName(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
                />
                
                <input
                  type="email"
                  required
                  placeholder="Your Email Address *"
                  value={bookingEmail}
                  onChange={(e) => setBookingEmail(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
                />
                
                <input
                  type="text"
                  placeholder="Purpose of call (Optional)"
                  value={bookingPurpose}
                  onChange={(e) => setBookingPurpose(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              {bookingMessage && (
                <p className={`text-xs py-1.5 rounded-lg text-center font-bold ${
                  bookingStatus === "success" 
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400" 
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  {bookingMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={bookingStatus === "loading"}
                className="w-full py-2.5 font-bold text-xs bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-lg hover:from-indigo-500 hover:to-violet-500 transition-all flex items-center justify-center gap-1.5"
              >
                {bookingStatus === "loading" ? "Processing..." : "Confirm Booking"}
              </button>
            </form>
          )}

          {/* Simple Recent Bookings list */}
          {!selectedDate && (
            <div className="flex-1 flex flex-col justify-center items-center text-center text-slate-500 px-4 space-y-2 pt-8">
              <span className="text-2xl">📅</span>
              <p className="text-xs font-semibold">Select any highlighted date to check available timeslots and book a call.</p>
            </div>
          )}

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
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold border border-slate-850 bg-slate-900/40 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-400 text-slate-400 transition-all duration-300 active:scale-95 disabled:pointer-events-none"
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
