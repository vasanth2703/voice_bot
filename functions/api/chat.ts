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

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}) {
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

    // Forward request to the FastAPI RAG backend on Render
    const renderResponse = await fetch(`${renderBackendUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, history }),
    });

    if (!renderResponse.ok) {
      const errorText = await renderResponse.text();
      console.error("Render Backend error:", errorText);
      throw new Error(`Render Backend returned status ${renderResponse.status}`);
    }

    const data = (await renderResponse.json()) as any;
    const { reply, history: updatedHistory } = data;

    // Log the user message and final reply to D1 Database chat_logs
    const db = env.DB;
    if (db && message && reply) {
      try {
        await db
          .prepare("INSERT INTO chat_logs (question, answer) VALUES (?, ?)")
          .bind(message, reply)
          .run();
      } catch (logErr) {
        console.error("Failed to log chat to D1:", logErr);
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

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
