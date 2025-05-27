
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const AZURE_API_KEY = Deno.env.get("AZURE_OPENAI_KEY");
const AZURE_DEPLOYMENT_NAME = "gpt-4.1-mini";
const AZURE_ENDPOINT = "https://<your-resource-name>.openai.azure.com";
const AZURE_API_VERSION = "2024-04-01-preview";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: { query: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!AZURE_API_KEY) {
    return new Response("Missing Azure API key", { status: 500 });
  }

  const response = await fetch(
    `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${AZURE_API_VERSION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY,
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "You are a helpful assistant that answers questions about a university syllabus." },
          { role: "user", content: body.query }
        ]
      }),
    }
  );

  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content || "No response from Azure OpenAI";

  return new Response(JSON.stringify({ answer }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
