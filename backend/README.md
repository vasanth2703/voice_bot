# Chatbot RAG Backend (FastAPI + ChromaDB + SentenceTransformers + Gemini)

This is the Python-based backend service for the Personal Voice Interview Bot, implementing the requested RAG pipeline:
```
[User Query]
    │
    ▼
[SentenceTransformer] (Generates embedding for query)
    │
    ▼
[ChromaDB] (Vector Database: performs semantic similarity search)
    │
    ▼
[Retrieved Chunks] (Top 5 most relevant profile/resume sections)
    │
    ▼
[Custom Prompt] (Dynamically injects retrieved chunks as system context)
    │
    ▼
[Gemini] (Generates accurate, grounded first-person response)
```

## 🛠️ Components & Architecture

1. **`main.py`**: FastAPI application exposing:
   - `POST /api/chat`: Chat interaction endpoint. Dynamically performs vector search on ChromaDB, builds the custom system prompt, and executes the Gemini tool-calling loop (for booking calls/checking availability).
   - `GET /api/logs`: Fetches recent chat history and scheduled bookings.
2. **`rag_engine.py`**: Encapsulates:
   - SentenceTransformer using the model `all-MiniLM-L6-v2` for generating embeddings.
   - ChromaDB Persistent Client (stored locally under `chromadb_store/`).
   - Query indexing, searching, and custom system prompt assembly.
3. **`database.py`**: Replicates the SQLite schema (`chat_logs` and `bookings` tables) locally, mimicking the Cloudflare D1 environment.
4. **`populate_db.py`**: Parses the candidate profile markdown (`knowledge_base.md`), segments it into overlapping chunks, computes semantic embeddings, and stores them in ChromaDB.

---

## 🚀 Setup & Execution

### 1. Configure the Environment
Ensure your Python environment is ready. Go to the `backend/` folder and copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Edit `.env` and insert your actual `GEMINI_API_KEY`.

### 2. Install Dependencies
Run the following commands to set up your Python virtual environment and install packages:
```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Populate ChromaDB Vector Database
Index the Candidate Profile Markdown file (`functions/api/knowledge_base.md`) into ChromaDB:
```bash
python3 populate_db.py
```
This splits the document, creates embeddings using SentenceTransformers, and writes them to `backend/chromadb_store/`.

### 4. Start the FastAPI Server
Launch the backend server:
```bash
python3 main.py
```
The FastAPI application will run at **`http://localhost:8000`**. You can view the interactive documentation at `http://localhost:8000/docs`.

---

## 🔄 Running with the Frontend

We have configured a Vite API proxy in `vite.config.ts`. 

To run the full stack locally:
1. In one terminal, activate the backend venv and start FastAPI:
   ```bash
   source venv/bin/activate
   python3 main.py
   ```
2. In another terminal, start the React dev server:
   ```bash
   npm run dev
   ```
3. Open `http://localhost:5173`. Any call to `/api/chat` or `/api/logs` will be proxied to your FastAPI service.
