// worker.js — syllabus bot backend (Azure OpenAI variant)
//
// Receives a question from the frontend, fetches the syllabus from GitHub,
// asks Azure OpenAI for an answer, optionally logs the exchange to Qualtrics.
//
// Also handles feedback submissions: if the request body contains a "feedback"
// field, the worker logs it to Qualtrics and skips the LLM call. This is used
// by the thumbs-up / thumbs-down buttons in index.html.
//
// Required environment variables (Cloudflare → Settings → Variables and Secrets):
//
//   AZURE_OPENAI_KEY      (Secret)  required, Azure OpenAI API key
//   AZURE_ENDPOINT        (Text)    required, e.g. https://chatbot-api-western.openai.azure.com
//   AZURE_DEPLOYMENT_NAME (Text)    required, e.g. gpt-4.1-mini (the deployment name in your Azure resource)
//   AZURE_API_VERSION     (Text)    optional, defaults to 2024-04-01-preview
//   QUALTRICS_API_TOKEN   (Secret)  optional, needed for logging
//   QUALTRICS_SURVEY_ID   (Text)    optional, needed for logging
//   QUALTRICS_DATACENTER  (Text)    optional, e.g. uwo.eu
//   COURSE_PAGE_URL       (Text)    public course web page shown in every response
//   SYLLABUS_URL          (Text)    raw GitHub URL of this bot's syllabus (.md or .txt)
//                                   e.g. https://raw.githubusercontent.com/USER/REPO/main/syllabus.md
//
// Qualtrics survey must have three embedded data fields:
//   queryText, responseText, feedback

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(req, env) {
    const AZURE_OPENAI_KEY = env.AZURE_OPENAI_KEY;
    const AZURE_ENDPOINT = env.AZURE_ENDPOINT;
    const AZURE_DEPLOYMENT_NAME = env.AZURE_DEPLOYMENT_NAME;
    const AZURE_API_VERSION = env.AZURE_API_VERSION || "2024-04-01-preview";
    const QUALTRICS_API_TOKEN = env.QUALTRICS_API_TOKEN;
    const QUALTRICS_SURVEY_ID = env.QUALTRICS_SURVEY_ID;
    const QUALTRICS_DATACENTER = env.QUALTRICS_DATACENTER;
    const COURSE_PAGE_URL = env.COURSE_PAGE_URL || "";
    const SYLLABUS_URL = env.SYLLABUS_URL;

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
    }

    // Parse body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
    }

    // Helper: log a row to Qualtrics. Returns a status string.
    async function logToQualtrics(values) {
      if (!QUALTRICS_API_TOKEN || !QUALTRICS_SURVEY_ID || !QUALTRICS_DATACENTER) {
        return "Qualtrics not called (Check Env Vars)";
      }
      try {
        const qt = await fetch(
          `https://${QUALTRICS_DATACENTER}.qualtrics.com/API/v3/surveys/${QUALTRICS_SURVEY_ID}/responses`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-TOKEN": QUALTRICS_API_TOKEN,
            },
            body: JSON.stringify({ values }),
          }
        );
        return `Qualtrics status: ${qt.status}`;
      } catch (e) {
        console.error(e);
        return "Qualtrics connection failed";
      }
    }

    // Feedback path: short-circuit before any LLM call.
    // Frontend sends { query, responseText, feedback: "helpful" | "not_helpful" }
    if (body.feedback) {
      const status = await logToQualtrics({
        queryText: body.query || "",
        responseText: body.responseText || "",
        feedback: body.feedback,
      });
      return new Response(`Feedback recorded. [${status}]`, {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // Question path
    if (!AZURE_OPENAI_KEY) {
      return new Response("Missing AZURE_OPENAI_KEY. Check Cloudflare Variables and Secrets.", { status: 500, headers: corsHeaders });
    }
    if (!AZURE_ENDPOINT || !AZURE_DEPLOYMENT_NAME) {
      return new Response("Missing AZURE_ENDPOINT or AZURE_DEPLOYMENT_NAME.", { status: 500, headers: corsHeaders });
    }
    if (!SYLLABUS_URL) {
      return new Response("Missing SYLLABUS_URL.", { status: 500, headers: corsHeaders });
    }

    // Load syllabus from GitHub. cache: "no-store" forces a fresh fetch every
    // time, so edits to the syllabus appear immediately without redeploying.
    const syllabus = await fetch(SYLLABUS_URL, { cache: "no-store" })
      .then(r => r.text())
      .catch(() => "Error loading syllabus.");

    const messages = [
      {
        role: "system",
        content: "You are an accurate assistant. Always include a source URL if possible."
      },
      {
        role: "system",
        content: `Here is important context from the syllabus:\n${syllabus}`,
      },
      {
        role: "user",
        content: body.query,
      },
    ];

    const azureUrl = `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT_NAME}/chat/completions?api-version=${AZURE_API_VERSION}`;
    const azureResponse = await fetch(azureUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": AZURE_OPENAI_KEY,
      },
      body: JSON.stringify({
        messages,
        max_tokens: 1500,
      }),
    });

    const azureJson = await azureResponse.json();
    const baseResponse = azureJson?.choices?.[0]?.message?.content || "No response from Azure OpenAI";
    const result = `${baseResponse}\n\nThere may be errors in my responses; always refer to the course web page: ${COURSE_PAGE_URL}`;

    const qualtricsStatus = await logToQualtrics({
      queryText: body.query || "",
      responseText: result,
      feedback: "",
    });

    return new Response(`${result}\n\n[System Log: ${qualtricsStatus}]`, {
      headers: {
        "Content-Type": "text/plain",
        ...corsHeaders,
      },
    });
  }
};
