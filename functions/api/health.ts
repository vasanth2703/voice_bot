interface Env {
  RENDER_BACKEND_URL?: string;
}

export async function onRequestGet(context: {
  request: Request;
  env: Env;
}) {
  return handleHealth(context.request, context.env);
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
}) {
  return handleHealth(context.request, context.env);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

async function handleHealth(request: Request, env: Env) {
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
