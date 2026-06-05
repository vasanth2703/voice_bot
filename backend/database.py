import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any

DB_PATH = os.path.join(os.path.dirname(__file__), "voice_bot.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create chat_logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS chat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # Create bookings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        booking_time TEXT NOT NULL,
        purpose TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    conn.commit()
    conn.close()

def save_chat_log(question: str, answer: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO chat_logs (question, answer) VALUES (?, ?)",
        (question, answer)
    )
    conn.commit()
    conn.close()

def get_latest_chat_logs(limit: int = 30) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, question, answer, timestamp FROM chat_logs ORDER BY timestamp DESC LIMIT ?",
        (limit,)
    )
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": row["id"],
            "question": row["question"],
            "answer": row["answer"],
            "timestamp": row["timestamp"]
        }
        for row in rows
    ]

def get_all_bookings() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, name, email, booking_time, purpose, timestamp FROM bookings ORDER BY booking_time ASC"
    )
    rows = cursor.fetchall()
    conn.close()
    
    return [
        {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "booking_time": row["booking_time"],
            "purpose": row["purpose"],
            "timestamp": row["timestamp"]
        }
        for row in rows
    ]

def check_availability(date_str: str) -> Dict[str, Any]:
    # date_str format: YYYY-MM-DD
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT booking_time FROM bookings WHERE booking_time LIKE ?",
        (f"{date_str}%",)
    )
    rows = cursor.fetchall()
    conn.close()
    
    booked_times = [row["booking_time"] for row in rows]
    
    # Define standard available hours on weekdays (Mon-Fri)
    standard_hours = ["09:00", "10:00", "11:00", "14:00", "15:00", "16:00"]
    
    # Determine day of the week
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        day = date_obj.weekday()  # 0 is Monday, 6 is Sunday
        
        if day >= 5:  # Saturday or Sunday
            return {
                "date": date_str,
                "status": "weekend",
                "message": "Calls can only be scheduled on weekdays (Monday to Friday, 9:00 AM - 5:00 PM IST).",
                "availableSlots": []
            }
            
        available_slots = []
        for hour in standard_hours:
            full_slot = f"{date_str} {hour}"
            if full_slot not in booked_times:
                available_slots.append(full_slot)
                
        return {
            "date": date_str,
            "bookedSlots": booked_times,
            "availableSlots": available_slots,
            "message": f"Available slots on {date_str} (Mon-Fri): " + ", ".join([s.split(" ")[1] for s in available_slots]) if available_slots else f"No available slots on {date_str}. All times are booked or unavailable."
        }
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD."}

def book_call(name: str, email: str, booking_time: str, purpose: str = "") -> Dict[str, Any]:
    # booking_time format: YYYY-MM-DD HH:MM
    # Validate format
    try:
        datetime.strptime(booking_time, "%Y-%m-%d %H:%M")
    except ValueError:
        return {
            "success": False,
            "error": "Invalid bookingTime format. Please use YYYY-MM-DD HH:MM format (e.g. '2026-06-08 14:00')."
        }
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if slot already booked
    cursor.execute("SELECT id FROM bookings WHERE booking_time = ?", (booking_time,))
    existing = cursor.fetchone()
    
    if existing:
        conn.close()
        return {
            "success": False,
            "error": f"The timeslot '{booking_time}' is already booked. Please check availability and select a different slot."
        }
        
    # Insert new booking
    cursor.execute(
        "INSERT INTO bookings (name, email, booking_time, purpose) VALUES (?, ?, ?, ?)",
        (name, email, booking_time, purpose)
    )
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "bookingTime": booking_time,
        "message": f"Successfully booked a call for {name} ({email}) on {booking_time}."
    }

# Initialize database tables on import or script run
init_db()
