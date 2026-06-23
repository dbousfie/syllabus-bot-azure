# Syllabus Bot (Azure OpenAI variant)

Same as the standard syllabus bot template, but uses Azure OpenAI instead of OpenAI's public API. Use this when course content involves student input that needs to stay within institutional infrastructure.

## How it works

Three pieces, in two places:

- **Frontend** (`index.html`) — hosted on GitHub Pages. Students see a web page, type a question, click submit, get an answer, and rate it 👍 or 👎.
- **Backend** (`worker.js`) — runs on Cloudflare Workers. Receives each request, fetches the syllabus from this GitHub repo at runtime, sends it to Azure OpenAI with the question, returns the answer, and logs to Qualtrics.
- **Content** (`syllabus.md` or `syllabus.txt`) — lives in this repo. The worker fetches a fresh copy on every request, so editing the syllabus and committing immediately updates what the bot knows. No redeploy needed.

The frontend, content workflow, and Qualtrics logging are identical to the OpenAI template. Only the LLM call differs.

## Setup

### 1. Create your repo
Use this template on GitHub. Name it after your course.

### 2. Edit the syllabus file
Replace the contents with your course policies, grading criteria, deadlines, readings — anything you want the bot to know.

### 3. Deploy the worker
1. dash.cloudflare.com → **Compute (Workers)** → **Create** → **Start with Hello World!**
2. Name your worker (e.g., `3210azurebot`).
3. After it deploys, click **Edit code**.
4. Ctrl+A → Delete (the editor must be completely empty before pasting), then paste `worker.js` from this repo.
5. Click **Deploy**.

Verify: visit your worker URL in a browser. You should see "Method Not Allowed" — that's correct. If you see "Hello World!", the paste didn't take; redo step 4.

### 4. Set environment variables

In the worker's page → **Settings** → **Variables and Secrets** → **+ Add** (or click **Edit** to set multiple at once):

| Name | Type | Required | Value |
|---|---|---|---|
| `AZURE_OPENAI_KEY` | Secret | yes | Your Azure OpenAI API key |
| `AZURE_ENDPOINT` | Text | yes | e.g., `https://chatbot-api-western.openai.azure.com` |
| `AZURE_DEPLOYMENT_NAME` | Text | yes | The deployment name in your Azure resource (e.g., `gpt-4.1-mini`) |
| `AZURE_API_VERSION` | Text | yes | e.g. `2025-04-01-preview` |
| `SYLLABUS_URL` | Text | yes | Raw GitHub URL of this repo's syllabus file |
| `COURSE_PAGE_URL` | Text | yes | Public course web page; appears at the bottom of every response |
| `QUALTRICS_API_TOKEN` | Secret | for logging | |
| `QUALTRICS_SURVEY_ID` | Text | for logging | starts with `SV_` |
| `QUALTRICS_DATACENTER` | Text | for logging | e.g., `uwo.eu` |

For `SYLLABUS_URL`: open the syllabus file in your repo on GitHub, click the **Raw** button, copy the URL from your browser. The worker accepts `.md` or `.txt` — whatever the URL points to.

**Where to find Azure values:**
- `AZURE_ENDPOINT` and `AZURE_DEPLOYMENT_NAME` come from your Azure OpenAI resource. In the Azure portal: your resource → "Go to Azure OpenAI Studio" → Deployments → see the deployment name. The endpoint is on your resource's "Keys and Endpoint" page.
- `AZURE_OPENAI_KEY` is on the same "Keys and Endpoint" page (Key 1 or Key 2).

### 5. Configure Qualtrics

Add three embedded data fields to your Qualtrics survey:
- `queryText`
- `responseText`
- `feedback`

Each question creates one Qualtrics row (with `feedback` empty). Each thumbs-click creates a second row with the same query/response and a `feedback` value of `helpful` or `not_helpful`. Filter for `feedback = not_helpful` to find responses that need a syllabus fix.

### 6. Point the frontend at your worker

In `index.html`, near the top of the `<script>` block:
```js
const WORKER_URL = "https://<your-name>.<your-subdomain>.workers.dev/";
```
Set this to your Cloudflare worker URL. Commit.

### 7. Publish the frontend
- Repo → **Settings** → **Pages**
- Branch: `main`, Folder: `/ (root)` → **Save**
- Wait 1–2 minutes for the first build, then visit the published URL
- For Brightspace: paste `brightspace.html` as a content item

## Day-to-day editing

Same as the standard template:

| Change | What to do | Live immediately? |
|---|---|---|
| Edit syllabus content | Edit syllabus file in GitHub, commit | Yes, on next request |
| Update the course web link | Edit `COURSE_PAGE_URL` in Cloudflare dashboard | Yes |
| Switch Azure deployment | Edit `AZURE_DEPLOYMENT_NAME` in dashboard | Yes |
| Rotate the API key | Edit the `AZURE_OPENAI_KEY` Secret in dashboard | Yes |
| Change frontend appearance | Edit `index.html` on GitHub | After GitHub Pages rebuilds (1–2 min) and a hard refresh |
| Change prompt or backend logic | Edit `worker.js` in Cloudflare's editor → click **Deploy** | After Deploy click |

## Reading feedback in Qualtrics

Filter the survey for `feedback = not_helpful` to see responses students flagged as bad. Each row shows the query that produced the response and the response text, useful for identifying:
- Gaps in your syllabus (info wasn't there)
- Confusing language students asked about
- Outdated dates or policies

## Why use this variant instead of the standard one

The standard template uses OpenAI's public API. Use this Azure variant when:
- Course activities involve student-generated content that should stay within institutional infrastructure
- You need the procurement / data-handling agreements that come with your institution's Azure deployment
- You want to use Azure-specific deployments (different model availability, fine-tuned versions, etc.)

For policy/syllabus questions where students aren't submitting personal content, the standard OpenAI template is simpler and equally good.

## Notes

- **CORS** is handled by the worker, so iframe and cross-domain calls from Brightspace and GitHub Pages work without extra config.
- **Fetch caching is disabled** for syllabus reads (`cache: "no-store"`), so syllabus edits appear immediately.
- **Per-bot isolation:** each bot is its own Cloudflare Worker with its own env vars. Azure keys can differ per bot for cost tracking.
- **Token cap:** Responses are limited to 1500 tokens. Increase `max_tokens` in `worker.js` if needed (then redeploy).
- **Free tier:** Cloudflare Workers free tier is 100,000 requests/day. Azure OpenAI billing is separate and depends on your institution's agreement.
- **Feedback clicks are free:** thumbs-up/down submissions don't call Azure OpenAI, so they don't incur LLM costs.

## Files
- `index.html` — public interface with feedback buttons
- `brightspace.html` — LMS iframe wrapper
- `worker.js` — Cloudflare Workers backend (running copy lives in Cloudflare; this is the backup)
- `syllabus.md` (or `syllabus.txt`) — course content used as context
- `README.md` — this file

## License
© Dan Bousfield. CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
