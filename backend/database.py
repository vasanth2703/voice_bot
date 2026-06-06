import sqlite3
import os
from datetime import datetime
from typing import List, Dict, Any, Optional
from contextvars import ContextVar

request_bookings: ContextVar[Optional[List[Dict[str, Any]]]] = ContextVar("request_bookings", default=None)

def set_request_bookings(bookings: Optional[List[Dict[str, Any]]]):
    request_bookings.set(bookings)

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
    bookings = request_bookings.get()
    if bookings is not None:
        # Filter bookings for this date
        booked_times = [b["booking_time"] for b in bookings if b["booking_time"].startswith(date_str)]
    else:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT booking_time FROM bookings WHERE booking_time LIKE ?",
            (f"{date_str}%",)
        )
        rows = cursor.fetchall()
        conn.close()
        booked_times = [row["booking_time"] for row in rows]
        
    try:
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
        day = date_obj.weekday()  # 0 is Monday, 6 is Sunday
        
        if day >= 5:  # Saturday or Sunday
            # Free all day (9:00 AM to 9:00 PM IST)
            available_hours = [
                "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
                "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
            ]
            message_type = "weekend"
        else:
            # Weekdays: after 7:00 PM IST
            available_hours = ["19:00", "20:00", "21:00", "22:00"]
            message_type = "weekday"
            
        available_slots = []
        for hour in available_hours:
            full_slot = f"{date_str} {hour}"
            if full_slot not in booked_times:
                available_slots.append(full_slot)
                
        day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        day_name = day_names[day]
        
        if message_type == "weekend":
            msg = f"Available slots on {day_name}, {date_str} (Weekend - Free All Day): " + ", ".join([s.split(" ")[1] for s in available_slots]) if available_slots else f"No available slots on {date_str}. All times are booked."
        else:
            msg = f"Available slots on {day_name}, {date_str} (Weekday - Free after 7 PM IST): " + ", ".join([s.split(" ")[1] for s in available_slots]) if available_slots else f"No available slots on {date_str}. All times are booked."
            
        return {
            "date": date_str,
            "dayOfWeek": day_name,
            "bookedSlots": booked_times,
            "availableSlots": available_slots,
            "message": msg
        }
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD."}

def book_call(name: str, email: str, booking_time: str, purpose: str = "") -> Dict[str, Any]:
    # booking_time format: YYYY-MM-DD HH:MM
    # Validate format
    try:
        dt = datetime.strptime(booking_time, "%Y-%m-%d %H:%M")
    except ValueError:
        return {
            "success": False,
            "error": "Invalid bookingTime format. Please use YYYY-MM-DD HH:MM format (e.g. '2026-06-08 19:00')."
        }
        
    # Check weekday/weekend rule
    day = dt.weekday()
    hour_str = dt.strftime("%H:%M")
    
    if day >= 5:  # Weekend
        # Free 9:00 AM to 9:00 PM
        valid_hours = [
            "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
            "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
        ]
        if hour_str not in valid_hours:
            return {
                "success": False,
                "error": f"Invalid slot. On weekends, slots must be between 09:00 AM and 09:00 PM IST (hourly)."
            }
    else:  # Weekday
        # Free after 7:00 PM (19:00, 20:00, 21:00, 22:00)
        valid_hours = ["19:00", "20:00", "21:00", "22:00"]
        if hour_str not in valid_hours:
            return {
                "success": False,
                "error": f"Invalid slot. On weekdays, slots are only available after 7:00 PM IST (19:00, 20:00, 21:00, 22:00)."
            }

    # Check if slot already booked
    bookings = request_bookings.get()
    if bookings is not None:
        is_booked = any(b["booking_time"] == booking_time for b in bookings)
        if is_booked:
            return {
                "success": False,
                "error": f"The timeslot '{booking_time}' is already booked. Please check availability and select a different slot."
            }
    else:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM bookings WHERE booking_time = ?", (booking_time,))
        existing = cursor.fetchone()
        if existing:
            conn.close()
            return {
                "success": False,
                "error": f"The timeslot '{booking_time}' is already booked. Please check availability and select a different slot."
            }
            
    # Always write to local SQLite as fallback/local dev (and in production the worker will sync it to D1)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO bookings (name, email, booking_time, purpose) VALUES (?, ?, ?, ?)",
            (name, email, booking_time, purpose)
        )
        conn.commit()
        conn.close()
    except Exception as e:
        # If SQLite insert fails (e.g. read-only system or other error), we still return success
        # if request_bookings is active (since in production we only care about D1 writing which is done by worker)
        if bookings is None:
            return {
                "success": False,
                "error": f"Failed to save booking to database: {e}"
            }
    
    return {
        "success": True,
        "bookingTime": booking_time,
        "message": f"Successfully booked a call for {name} ({email}) on {booking_time}."
    }

# Initialize database tables on import or script run
init_db()
