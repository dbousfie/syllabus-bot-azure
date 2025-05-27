import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const AZURE_API_KEY = Deno.env.get("AZURE_OPENAI_KEY");
const QUALTRICS_API_TOKEN = Deno.env.get("QUALTRICS_API_TOKEN");
const QUALTRICS_SURVEY_ID = Deno.env.get("QUALTRICS_SURVEY_ID");
const QUALTRICS_DATACENTER = Deno.env.get("QUALTRICS_DATACENTER");
const SYLLABUS_LINK = Deno.env.get("SYLLABUS_LINK") || "";

const AZURE_DEPLOYMENT_NAME = "gpt-4.1-mini";
const AZURE_ENDPOINT = "https://chatbot-api-western.openai.azure.com";
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

  const syllabus = await Deno.readTextFile("syllabus.txt").catch(() =>
    "Error loading syllabus."
  );

  const messages = [
    {
      role: "system",
      content:
        "You are an accurate assistant. Always include a source URL if possible.",
    },
    {
      role: "system",
      content: `Here is important context from syllabus.txt:\n${syllabus}`,
    },
    {
      role: "user",
      content: body.query,
    },
  ];

  const azureResponse = await fetch(
    `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${AZURE_API_VERSION}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_API_KEY,
      },
      body: JSON.stringify({
        messages,
      }),
    }
  );

  const azureJson = await azureResponse.json();
  const baseResponse =
    azureJson?.choices?.[0]?.message?.content || "No response from Azure OpenAI";
  const result = `${baseResponse}\n\nThere may be errors in my responses; always refer to the course web page: ${SYLLABUS_LINK}`;

  let qualtricsStatus = "Qualtrics not called";

  if (QUALTRICS_API_TOKEN && QUALTRICS_SURVEY_ID && QUALTRICS_DATACENTER) {
    const qualtricsPayload = {
      values: {
        responseText: result,
        queryText: body.query,
      },
    };

    const qt = await fetch(
      `https://${QUALTRICS_DATACENTER}.qualtrics.com/API/v3/surveys/${QUALTRICS_SURVEY_ID}/responses`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-TOKEN": QUALTRICS_API_TOKEN,
        },
        body: JSON.stringify(qualtricsPayload),
      }
    );

    qualtricsStatus = `Qualtrics status: ${qt.status}`;
  }

  return new Response(`${result}\n<!-- ${qualtricsStatus} -->`, {
    headers: {
      "Content-Type": "text/plain",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
