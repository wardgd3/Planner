import type { Context, Config } from "@netlify/functions";
import { createHmac } from "crypto";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { username, password } = await req.json();

  const validUser = Netlify.env.get("GATE_USER");
  const validPass = Netlify.env.get("GATE_PASSWORD");
  const secret = Netlify.env.get("TOKEN_SECRET") || validPass || "fallback-secret";

  if (username === validUser && password === validPass) {
    const timestamp = Date.now().toString();
    const signature = createHmac("sha256", secret)
      .update(`${username}:${timestamp}`)
      .digest("hex");
    const token = btoa(`${username}:${timestamp}:${signature}`);

    return new Response(JSON.stringify({ success: true, token }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: false, error: "Invalid credentials" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }
  );
};

export const config: Config = {
  path: "/api/login",
};
