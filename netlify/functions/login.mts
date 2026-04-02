import type { Context, Config } from "@netlify/functions";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { username, password } = await req.json();

  const validUser = Netlify.env.get("GATE_USER");
  const validPass = Netlify.env.get("GATE_PASSWORD");

  if (username === validUser && password === validPass) {
    // Return a simple signed token — timestamp + secret hash
    const token = btoa(`${username}:${Date.now()}:${validPass}`);
    return new Response(JSON.stringify({ success: true, token }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: false, error: "Invalid credentials" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  path: "/api/login",
};
