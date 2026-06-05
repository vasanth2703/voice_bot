import os
import sys
from rag_engine import RAGEngine

def main():
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(backend_dir)
    kb_path = os.path.join(root_dir, "functions", "api", "knowledge_base.md")
    
    if not os.path.exists(kb_path):
        print(f"Error: Candidate knowledge base not found at {kb_path}")
        sys.exit(1)
        
    print("Initializing RAG engine...")
    rag = RAGEngine()
    
    print("Populating database...")
    try:
        rag.populate_database(kb_path)
        print("Success! ChromaDB vector store is populated.")
    except Exception as e:
        print(f"Error during population: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
