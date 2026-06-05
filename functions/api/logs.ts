interface Env {
  DB: D1Database;
}

export async function onRequestGet(context: { env: Env }) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  const db = context.env.DB;
  if (!db) {
    return new Response(JSON.stringify({ error: "Database binding DB is missing." }), {
      status: 500,
      headers,
    });
  }

  try {
    // Fetch latest 30 chat logs
    const chatLogsQuery = await db
      .prepare("SELECT * FROM chat_logs ORDER BY timestamp DESC LIMIT 30")
      .all();
    
    // Fetch all bookings
    const bookingsQuery = await db
      .prepare("SELECT * FROM bookings ORDER BY booking_time ASC")
      .all();

    return new Response(
      JSON.stringify({
        chatLogs: chatLogsQuery.results || [],
        bookings: bookingsQuery.results || [],
      }),
      { status: 200, headers }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || err }),
      { status: 500, headers }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
