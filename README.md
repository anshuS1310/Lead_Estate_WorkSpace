# Lead Estate

**Deployed**: https://lead-estate-work-space.vercel.app/

Lead Estate is an AI-assisted workspace for reviewing real-estate customer inquiries. It turns customer messages into organized lead records, highlights the evidence behind extracted details, and helps a salesperson decide what to follow up on next.

The project is a local-first pilot. Lead records are stored in the browser that created them; the application does not currently provide accounts or a shared database.

## Capabilities

- **Capture inquiries:** Start a lead from a customer message and review or edit the name, location, property requirements, budget, and buying timeline.
- **Extract details with evidence:** Ask Gemini to suggest field values and show the matching text from the original message. AI suggestions remain editable and reviewable.
- **Prioritize with an explainable score:** Code calculates a score from four factors and displays the evidence and reason for each factor. The model does not calculate the total.
- **Review follow-up messages:** Add a later customer message to an existing lead, preview proposed field changes and a provisional analysis, then accept the changes or keep the existing fields.
- **Prepare follow-up:** Review a suggested reply, next action, customer intent, concerns, missing details, and conflicts. The assistant can answer questions about the selected lead.
- **Manage records:** Sort and filter leads, include or exclude messages in analysis, remove messages or leads, and import or export JSON backups.
- **Use it on different screen sizes:** The workspace adapts for desktop and mobile layouts.

## Prioritization rubric

The score is a workflow aid, not a prediction that a customer will buy. It is calculated in code from supported customer messages and reviewed fields.

| Factor | Maximum | How points are assigned |
| --- | ---: | --- |
| Buying timeline | 30 | 30 for up to one month, 24 for up to three months, 16 for up to six months, and 8 for a later stated date. Past or unsupported dates score 0. A viewing request alone is not treated as a purchase timeline. |
| Budget clarity | 20 | Exact amounts and ranges no wider than 1.5× score 20; wider ranges score 8; ceilings score 15; floors score 8. Unsupported budgets score 0. |
| Requirements | 15 | 5 points for each distinct supported category, capped at three categories: location, property type, size or rooms, and amenity. |
| Buying signals | 35 | The analysis classifies the supported signal as none (0), options (10), engaged (22), or action (35). |

Priority labels are **Hot** for 70–100, **Warm** for 30–69, and **Cold** for 0–29. When available, timeline scoring uses the source message's entry date as its starting point and compares the resulting date with the current date. The analysis records a rubric version so saved scores can be interpreted in context.

## Technology

- Next.js App Router and React
- TypeScript
- Tailwind CSS
- Zustand for client-side workspace state
- Google GenAI SDK for Gemini-powered extraction, analysis, and chat
- Zod for request, response, and saved-record validation
- Vitest and ESLint for tests and code checks

## Requirements

- Node.js 24.x and npm
- A Google AI Studio project and Gemini API key for AI features

The default model is `gemini-3.5-flash-lite`. The model can be changed with the `GEMINI_MODEL` environment variable.

## Run locally

From the project root, install the locked dependencies and create a local environment file:

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
```

Set the values in `.env.local`:

```dotenv
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Start the development server:

```powershell
npm run dev
```

Open <http://localhost:3000>. Stop the server with **Ctrl+C**.

The Gemini key is read by server-side API routes. Keep it in `.env.local`; do not commit it or expose it through a `NEXT_PUBLIC_` variable. The repository's `.gitignore` excludes local environment files.

## Available commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run lint` | Run ESLint. |
| `npm run test` | Run the Vitest suite once. |
| `npx tsc --noEmit` | Check TypeScript types without emitting files. |
| `npm run build` | Create an optimized production build. |
| `npm run start` | Serve the production build locally; run `npm run build` first. |

## Project layout

```text
app/                 Application UI and server API routes
  api/analyze/       Analyze a lead and build its score
  api/autofill/      Extract supported details from a message
  api/chat/          Stream lead-specific assistant responses
  api/review-update/ Preview a later message and proposed updates
components/          Workspace, intake, analysis, chat, and UI components
lib/                 Lead types, browser storage, prompts, validation,
                     evidence checks, money parsing, and scoring
```

## Data handling and current limitations

- Leads, messages, drafts, analysis, and chat history are saved in the browser's local storage. They are not synchronized across browsers, devices, or team members. Clearing browser site data can remove them; export backups when needed.
- AI requests send the selected lead content to Google's Gemini API. Review Google's current data terms before using customer information. Content submitted through unpaid Gemini API services may be used to improve Google products, so use fictional details for testing.
- There is no sign-in, role-based access, shared server-side lead database, or centralized request quota. The API request limiting is best-effort and per server instance.
- AI extraction and analysis can be wrong. Check the source excerpts, field changes, score reasons, conflicts, and suggested replies before relying on them.
- The application does not send messages to customers or verify property inventory, availability, or appointment times.

This pilot is intended for evaluation with fictional data. A real customer-data workflow requires appropriate AI data terms, authentication, durable shared storage, and centralized access and abuse controls.
