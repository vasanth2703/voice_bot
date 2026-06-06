import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import google.generativeai as genai
from dotenv import load_dotenv

import database
from rag_engine import RAGEngine
import key_manager

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="Voice Bot RAG Backend")

# Setup CORS to allow request from the frontend dev server (typically http://localhost:5173 or all)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RAGEngine
rag = RAGEngine()

# Automatically populate ChromaDB on startup if empty
if rag.collection.count() == 0:
    print("ChromaDB collection is empty. Auto-populating...")
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    kb_path = os.path.join(root_dir, "functions", "api", "knowledge_base.md")
    if os.path.exists(kb_path):
        try:
            rag.populate_database(kb_path)
            print("Auto-population complete.")
        except Exception as e:
            print(f"Failed to auto-populate ChromaDB: {e}")
    else:
        print(f"Could not find knowledge_base.md at {kb_path} for auto-population.")

# Pydantic models for request/response validation
class ChatPart(BaseModel):
    text: Optional[str] = None
    functionCall: Optional[Dict[str, Any]] = None
    functionResponse: Optional[Dict[str, Any]] = None

class ChatMessage(BaseModel):
    role: str # "user", "model", "function"
    parts: List[ChatPart]

class ChatRequest(BaseModel):
    message: Optional[str] = None
    history: Optional[List[ChatMessage]] = []
    bookings: Optional[List[Dict[str, Any]]] = None

class BookRequest(BaseModel):
    name: str
    email: str
    bookingTime: str
    purpose: Optional[str] = ""

# Tool declarations for Gemini
def checkAvailability(date: str) -> Dict[str, Any]:
    """Checks available timeslots for a call on a given date (YYYY-MM-DD format). Only call this when the user asks for availability or available times on a specific date.
    
    Args:
        date: The date to check in YYYY-MM-DD format (e.g., '2026-06-08').
    """
    return database.check_availability(date)

def bookCall(name: str, email: str, bookingTime: str, purpose: str = "") -> Dict[str, Any]:
    """Books a call slot. Call this only when the user explicitly requests to book a call and provides their name, email, and selected slot time (format: YYYY-MM-DD HH:MM).
    
    Args:
        name: User's full name
        email: User's email address
        bookingTime: The date and time of the slot in YYYY-MM-DD HH:MM format (e.g. '2026-06-08 14:00').
        purpose: Optional purpose or description of the call
    """
    return database.book_call(name, email, bookingTime, purpose)

# Helper function to map frontend message to Google AI model content dictionary
def to_gemini_format(history: List[ChatMessage]) -> List[Dict[str, Any]]:
    gemini_history = []
    for msg in history:
        parts = []
        for part in msg.parts:
            if part.text is not None:
                parts.append({"text": part.text})
            elif part.functionCall is not None:
                parts.append({
                    "function_call": {
                        "name": part.functionCall["name"],
                        "args": part.functionCall["args"]
                    }
                })
            elif part.functionResponse is not None:
                parts.append({
                    "function_response": {
                        "name": part.functionResponse["name"],
                        "response": part.functionResponse["response"]
                    }
                })
        
        # In the Python SDK, "function" role responses are passed with role "function"
        gemini_history.append({
            "role": "function" if msg.role == "function" else msg.role,
            "parts": parts
        })
    return gemini_history

@app.get("/api/logs")
async def get_logs():
    """Retrieve chat logs and booking history from SQLite."""
    try:
        logs = database.get_latest_chat_logs(30)
        bookings = database.get_all_bookings()
        return {
            "chatLogs": logs,
            "bookings": bookings
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_endpoint(payload: ChatRequest):
    """Chat endpoint supporting RAG context retrieval and tool call loop."""
    message = payload.message
    history = payload.history or []
    
    if not message and not history:
        raise HTTPException(status_code=400, detail="Message or history is required.")
        
    api_keys = key_manager.get_api_keys()
    if not api_keys:
        return {
            "reply": "I'd love to answer that, but my connection is currently missing its API key configuration. Please configure GEMINI_API_KEY or GEMINI_API_KEYS as an environment variable.",
            "history": [msg.dict() for msg in history]
        }

    try:
        # Set request-scoped bookings in database
        if payload.bookings is not None:
            database.set_request_bookings(payload.bookings)
        else:
            database.set_request_bookings(None)
        # 1. RAG Vector Search: Query ChromaDB with user's query
        query_text = message if message else ""
        if not query_text and history:
            # Fallback to last user message if message is empty
            for msg in reversed(history):
                if msg.role == "user" and msg.parts:
                    query_text = next((p.text for p in msg.parts if p.text), "")
                    break
                    
        print(f"Retrieving chunks for query: '{query_text}'")
        retrieved_chunks = rag.search(query_text, top_k=5)
        print(f"Retrieved {len(retrieved_chunks)} relevant chunks from ChromaDB.")
        
        # 2. Build the System Instruction using the retrieved chunks
        system_instruction = rag.build_system_prompt(retrieved_chunks)
        
        # 3. Add user message to history
        if message:
            history.append(
                ChatMessage(
                    role="user",
                    parts=[ChatPart(text=message)]
                )
            )
            
        # 4. Initialize the Gemini Model
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=system_instruction,
            tools=[checkAvailability, bookCall]
        )
        
        # 5. Tool-calling Loop (max 5 iterations)
        tool_call_count = 0
        final_reply = ""
        
        while tool_call_count < 5:
            # Map state to gemini format
            contents = to_gemini_format(history)
            
            # Request generation
            response = key_manager.execute_with_retry(
                model.generate_content,
                contents=contents,
                generation_config={"temperature": 0.2, "max_output_tokens": 1000}
            )
            
            # Check for candidates and content
            if not response.candidates:
                raise Exception("Empty response candidate from Gemini API.")
                
            candidate = response.candidates[0]
            if not candidate.content or not candidate.content.parts:
                raise Exception("Empty content parts in response candidates.")
                
            first_part = candidate.content.parts[0]
            
            # Check if model wishes to call a tool
            if first_part.function_call:
                tool_call_count += 1
                fc_name = first_part.function_call.name
                fc_args = dict(first_part.function_call.args)
                
                print(f"Gemini requested tool call: {fc_name} with arguments: {fc_args}")
                
                # Add the model's tool call turn to history
                history.append(
                    ChatMessage(
                        role="model",
                        parts=[ChatPart(functionCall={"name": fc_name, "args": fc_args})]
                    )
                )
                
                # Execute the function locally
                tool_result = None
                if fc_name == "checkAvailability":
                    tool_result = checkAvailability(**fc_args)
                elif fc_name == "bookCall":
                    tool_result = bookCall(**fc_args)
                else:
                    tool_result = {"error": f"Function '{fc_name}' not found."}
                    
                print(f"Tool response: {tool_result}")
                
                # Add the function response turn to history
                history.append(
                    ChatMessage(
                        role="function",
                        parts=[ChatPart(functionResponse={"name": fc_name, "response": tool_result})]
                    )
                )
                
                # Loop continues to feed the function response back to Gemini
                continue
                
            # Otherwise, we have a text response
            final_reply = first_part.text or ""
            history.append(
                ChatMessage(
                    role="model",
                    parts=[ChatPart(text=final_reply)]
                )
            )
            break
            
        if not final_reply:
            final_reply = "I'm sorry, I encountered an issue processing your request. Please try again."
            
        # 6. Log the conversation to SQLite database (disabled: handled by Cloudflare proxy)
        # if message:
        #     database.save_chat_log(message, final_reply)
            
        return {
            "reply": final_reply,
            "history": [msg.dict() for msg in history]
        }
        
    except Exception as e:
        print(f"Error handling request: {e}")
        # Return elegant fallback to the user/frontend
        return {
            "reply": "Oops! An error occurred while trying to process that. Please try once more.",
            "error": str(e),
            "history": [msg.dict() for msg in history]
        }
    finally:
        database.set_request_bookings(None)

@app.post("/api/book")
async def book_endpoint(payload: BookRequest):
    res = database.book_call(
        name=payload.name,
        email=payload.email,
        booking_time=payload.bookingTime,
        purpose=payload.purpose
    )
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/populate")
async def populate_endpoint():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    kb_path = os.path.join(root_dir, "functions", "api", "knowledge_base.md")
    if not os.path.exists(kb_path):
        raise HTTPException(status_code=404, detail="knowledge_base.md not found")
    try:
        rag.populate_database(kb_path)
        return {"status": "success", "message": f"Successfully populated database with {rag.collection.count()} chunks."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    # Start the server on dynamic port
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
