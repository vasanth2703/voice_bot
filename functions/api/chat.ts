import { onRequestGet as handleLogs } from "./logs";

interface Env {
  RENDER_BACKEND_URL?: string;
  ASSETS?: { fetch: typeof fetch };
  DB: D1Database;
}

interface RequestBody {
  message?: string;
  history?: any[];
}

interface BookRequestBody {
  name?: string;
  email?: string;
  bookingTime?: string; // YYYY-MM-DD HH:MM
  purpose?: string;
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}) {
  const url = new URL(context.request.url);
  if (url.pathname === "/api/book" || url.pathname === "/book") {
    return handleBookRequest(context.request, context.env);
  }
  return handleRequest(context.request, context.env);
}

export async function onRequestOptions() {
  return handleOptions();
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat" || url.pathname === "/chat") {
      if (request.method === "OPTIONS") return handleOptions();
      if (request.method === "POST") return handleRequest(request, env);
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }
    if (url.pathname === "/api/book" || url.pathname === "/book") {
      if (request.method === "OPTIONS") return handleOptions();
      if (request.method === "POST") return handleBookRequest(request, env);
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }
    if (url.pathname === "/api/logs" || url.pathname === "/logs") {
      if (request.method === "OPTIONS") return handleOptions();
      if (request.method === "GET") return handleLogs({ env });
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      });
    }
    if (url.pathname === "/api/health" || url.pathname === "/health") {
      if (request.method === "OPTIONS") return handleOptions();
      return handleHealthRequest(request, env);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  }
};

async function handleRequest(request: Request, env: Env) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  try {
    const body = (await request.json()) as RequestBody;
    const { message, history } = body;

    const renderBackendUrl = env.RENDER_BACKEND_URL;
    if (!renderBackendUrl) {
      return new Response(
        JSON.stringify({
          reply: "I'm ready to chat, but the RENDER_BACKEND_URL environment variable is not configured in the Cloudflare dashboard.",
        }),
        { status: 500, headers }
      );
    }

    // 1. Fetch bookings from D1 to pass in context to the Python backend
    let bookingsList: any[] = [];
    const db = env.DB;
    if (db) {
      try {
        const d1Bookings = await db.prepare("SELECT name, email, booking_time, purpose FROM bookings").all();
        bookingsList = d1Bookings.results || [];
      } catch (d1Err) {
        console.error("Failed to query D1 bookings on chat init:", d1Err);
      }
    }

    // 2. Forward request to the FastAPI RAG backend on Render
    const renderResponse = await fetch(`${renderBackendUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, history, bookings: bookingsList }),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error("Render Backend error:", errorText);
      throw new Error(`Render Backend returned status ${renderResponse.status}`);
    }

    const data = (await renderResponse.json()) as any;
    const { reply, history: updatedHistory } = data;

    // 3. Log the user message and final reply to D1 Database chat_logs
    if (db) {
      if (message && reply) {
        try {
          await db
            .prepare("INSERT INTO chat_logs (question, answer) VALUES (?, ?)")
            .bind(message, reply)
            .run();
        } catch (logErr) {
          console.error("Failed to log chat to D1:", logErr);
        }
      }

      // 4. Auto-sync bookings from updatedHistory if successful
      if (updatedHistory && Array.isArray(updatedHistory)) {
        let lastBookCallArgs: any = null;
        for (const msg of updatedHistory) {
          if (msg.role === "model" && msg.parts) {
            for (const part of msg.parts) {
              if (part.functionCall && part.functionCall.name === "bookCall") {
                lastBookCallArgs = part.functionCall.args;
              }
            }
          } else if (msg.role === "function" && msg.parts) {
            for (const part of msg.parts) {
              if (part.functionResponse && part.functionResponse.name === "bookCall") {
                const responseData = part.functionResponse.response;
                if (responseData && responseData.success && lastBookCallArgs) {
                  const { name, email, bookingTime, purpose } = lastBookCallArgs;
                  if (name && email && bookingTime) {
                    try {
                      // Check if already in D1
                      const existing = await db
                        .prepare("SELECT id FROM bookings WHERE booking_time = ?")
                        .bind(bookingTime)
                        .first();
                      if (!existing) {
                        await db
                          .prepare("INSERT INTO bookings (name, email, booking_time, purpose) VALUES (?, ?, ?, ?)")
                          .bind(name, email, bookingTime, purpose || "")
                          .run();
                        console.log(`Synced booking for ${name} from AI tool call.`);
                      }
                    } catch (d1BookErr) {
                      console.error("Failed to insert booking from tool sync:", d1BookErr);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        reply,
        history: updatedHistory
      }),
      { status: 200, headers }
    );

  } catch (error: any) {
    console.error("Handler Error:", error);
    return new Response(
      JSON.stringify({
        reply: "Oops! An error occurred while trying to process that. Please try once more.",
        error: error.message || error
      }),
      { status: 500, headers }
    );
  }
}

async function handleBookRequest(request: Request, env: Env) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  try {
    const rawBody = await request.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: "Invalid JSON format." }), { status: 400, headers });
    }

    const db = env.DB;
    if (!db) {
      return new Response(
        JSON.stringify({ success: false, error: "D1 database binding is missing." }),
        { status: 500, headers }
      );
    }

    // 1. Detect and parse Cal.com Webhook trigger event
    if (body && body.triggerEvent === "BOOKING_CREATED" && body.payload) {
      const { startTime, attendees, description, title } = body.payload;
      const attendee = (attendees && attendees[0]) || {};
      const wName = attendee.name || "Anonymous User";
      const wEmail = attendee.email || "";
      const wPurpose = description || title || "Scheduled via Cal.com Widget";

      // Parse ISO string (e.g. 2026-06-08T14:30:00.000Z) to YYYY-MM-DD HH:MM
      const dt = new Date(startTime);
      if (isNaN(dt.getTime())) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid startTime format." }),
          { status: 400, headers }
        );
      }

      // Format as YYYY-MM-DD HH:MM in UTC (Cal.com sends UTC timestamps)
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      const hh = String(dt.getUTCHours()).padStart(2, '0');
      const mm = String(dt.getUTCMinutes()).padStart(2, '0');
      const formattedBookingTime = `${y}-${m}-${d} ${hh}:${mm}`;

      // Check if slot already booked in D1
      const existing = await db
        .prepare("SELECT id FROM bookings WHERE booking_time = ?")
        .bind(formattedBookingTime)
        .first();

      if (!existing) {
        await db
          .prepare("INSERT INTO bookings (name, email, booking_time, purpose) VALUES (?, ?, ?, ?)")
          .bind(wName, wEmail, formattedBookingTime, wPurpose)
          .run();
        console.log(`Synced Cal.com webhook booking for ${wName}.`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Webhook processed successfully." }),
        { status: 200, headers }
      );
    }

    // 2. Otherwise process direct manual booking request
    const { name, email, bookingTime, purpose } = body as BookRequestBody;

    if (!name || !email || !bookingTime) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing name, email, or bookingTime." }),
        { status: 400, headers }
      );
    }

    // Check weekday/weekend availability rules in Cloudflare worker
    const dateParts = bookingTime.split(" ");
    if (dateParts.length !== 2) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid bookingTime format. Use YYYY-MM-DD HH:MM." }),
        { status: 400, headers }
      );
    }
    const [dateStr, timeStr] = dateParts;
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    if (isNaN(dt.getTime())) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid bookingTime format. Use YYYY-MM-DD HH:MM." }),
        { status: 400, headers }
      );
    }

    const day = dt.getDay(); // 0 is Sunday, 6 is Saturday

    if (day === 0 || day === 6) { // Weekend
      const validHours = [
        "09:00", "10:00", "11:00", "12:00", "13:00", "14:00",
        "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"
      ];
      if (!validHours.includes(timeStr)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid slot. On weekends, slots must be between 09:00 AM and 09:00 PM IST (hourly)." }),
          { status: 400, headers }
        );
      }
    } else { // Weekday
      const validHours = ["19:00", "20:00", "21:00", "22:00"];
      if (!validHours.includes(timeStr)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid slot. On weekdays, slots are only available after 7:00 PM IST (19:00, 20:00, 21:00, 22:00)." }),
          { status: 400, headers }
        );
      }
    }

    // Check if slot already booked in D1
    const existing = await db
      .prepare("SELECT id FROM bookings WHERE booking_time = ?")
      .bind(bookingTime)
      .first();

    if (existing) {
      return new Response(
        JSON.stringify({ success: false, error: "The timeslot is already booked. Please choose another." }),
        { status: 400, headers }
      );
    }

    // Insert new booking
    await db
      .prepare("INSERT INTO bookings (name, email, booking_time, purpose) VALUES (?, ?, ?, ?)")
      .bind(name, email, bookingTime, purpose || "")
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        bookingTime,
        message: `Successfully booked a call for ${name} on ${bookingTime}.`
      }),
      { status: 200, headers }
    );

  } catch (error: any) {
    console.error("Booking handler error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || error }),
      { status: 500, headers }
    );
  }
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function handleHealthRequest(request: Request, env: Env) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  const renderBackendUrl = env.RENDER_BACKEND_URL;
  if (renderBackendUrl) {
    // Ping Render backend in the background to wake it up
    fetch(`${renderBackendUrl}/api/health`).catch(err => {
      console.error("Failed to wake up Render backend:", err);
    });
  }

  return new Response(
    JSON.stringify({ status: "ok", message: "Waking up backend..." }),
    { status: 200, headers }
  );
}
