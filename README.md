# 🎙️ Personal Voice Interview Bot & Interactive Scheduler

A premium, interactive, and voice-enabled web application that allows users to ask professional questions and hear replies in the first person representing the candidate. It integrates real-time similarity search (RAG) over the candidate's resume/repositories and features an interactive booking calendar UI.

---

## 🏗️ System Architecture & Dataflow

The application is split into a secure edge-serverless layer, a stateless vector-retrieval backend, and a reactive frontend dashboard.

```text
               +----------------------------------------+
               |           Vite React Frontend          |
               |     (Chat Interface & Booking UI)      |
               +-------------------+--------------------+
                                   |
                  (1) REST API     |     (4) REST API
                    Logs / Book    |       Chat Post
                                   v
               +----------------------------------------+
               |        Cloudflare Pages Function       |
               |            (Secure Edge Proxy)         |
               +----------+-------------------+---------+
                          |                   |
               (2) Read   |   (3) D1 Bind     | (5) Pass Bookings
                  / Write |     Bookings      |    & Chat payload
                          v                   v
               +------------------+   +-----------------+
               |   Cloudflare D1  |   |  FastAPI RAG    |
               |   SQL Database   |   | Backend (Render)|
               +------------------+   +--------+--------+
                                               |
                                     (6) Query | (7) Embed
                                      ChromaDB |    Query
                                               v
                                      +-----------------+
                                      | Gemini 2.5 Flash|
                                      |      RAG Model  |
                                      +-----------------+
```

### Key Architectural Layers:
1. **Frontend**: React (Vite + TS + Tailwind) page displaying a two-column desktop layout (8-col Chat, 4-col interactive booking Calendar).
2. **Edge proxy**: A Cloudflare Pages Function Worker (`/api/chat`, `/api/logs`, `/api/book`) that acts as a secure firewall. It fetches booking lists from **Cloudflare D1 SQL database**, feeds them into the RAG request payload, and scans returning history to automatically insert AI-completed bookings back into D1.
3. **Stateless RAG Backend**: A python FastAPI backend hosted on Render. It receives the chat payload and active bookings context, queries the pre-populated **ChromaDB vector store** using `models/gemini-embedding-001`, constructs the grounded system instruction, and processes the Gemini tool-call loop. 
4. **Key Manager**: Handles rate-limit safety by rotating through fallback API keys (`GEMINI_API_KEYS`) when encountering `429` rate limits.

---

## 🛠️ Local Development & Setup

### Backend Setup (Python)
1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```
2. **Create a virtual environment & install requirements**:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. **Populate database locally**:
   Set your `GEMINI_API_KEY` and run:
   ```bash
   $env:GEMINI_API_KEY="YOUR_GEMINI_KEY"
   python populate_db.py
   ```
4. **Start local backend server**:
   ```bash
   python main.py
   ```
   The server will boot on `http://localhost:8000`.

### Frontend Setup (Vite React)
1. **Install dependencies**:
   ```bash
   npm install
   ```
2. **Run Vite development server (with API proxy)**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173/](http://localhost:5173/) in your browser. All `/api` calls will automatically proxy to the Python backend on port `8000`.

---

## ⚡ API Cost Breakdown (Gemini 2.5 Flash)

Offloading embeddings and context to the Gemini API keeps the backend RAM usage **under 50MB** (safe from Render's 512MB RAM OOM limits) and keeps operational costs extremely low.

### Pricing Models:
- **Input Tokens**: \$0.075 / 1 million tokens (\$0.000000075 per token)
- **Output Tokens**: \$0.30 / 1 million tokens (\$0.00000030 per token)
- **Embeddings**: \$0.025 / 1 million tokens (\$0.000000025 per token)

### Cost per Single Chat Turn:
- **Query Embedding**: ~10 tokens = **\$0.00000025**
- **System context + History Input**: ~1,800 tokens = **\$0.00013500**
- **Model Output Response**: ~150 tokens = **\$0.00004500**
- **Total per turn**: **\$0.00018025** (~0.018 cents)

### Cost per complete session (Average 10 turns):
- **10 Turns**: 10 * \$0.00018025 = **\$0.0018025** (Approx. **0.18 cents** / **\$0.0018** per session).
- Building this with external API calls is over **95% cheaper** than hosting dedicated GPU/vCPU servers, while maintaining sub-second TTFB first-response latency.
