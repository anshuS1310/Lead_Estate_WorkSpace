# Lead Workspace

A browser-based real-estate lead workspace for reviewing customer messages, extracting details, analyzing priority, and preparing a suggested reply.

## Before using or sharing it

- **Use fictional customer details during this pilot.** Google says content sent through the Gemini API free tier may be used to improve its products. See [Gemini API pricing and data use](https://ai.google.dev/gemini-api/docs/pricing).
- Lead records and conversations are stored in the current browser only. There is no login, shared database, or cross-device sync. Clearing browser data can remove them; export backups regularly.
- The public API uses best-effort per-instance request limiting. It is not a shared quota or access-control system.
- Vercel Hobby is for personal, non-commercial use. Use an eligible paid plan for a business deployment; see [Vercel's Hobby plan](https://vercel.com/docs/plans/hobby) and [fair-use rules](https://vercel.com/docs/limits/fair-use-guidelines).
- This pilot is not ready for storing real customer data or business-wide use. That requires suitable AI data terms, authentication, durable shared storage, and centralized abuse controls.

## Requirements

- Node.js **24.x** and npm
- A Google AI Studio project and Gemini API key
- Git for the GitHub steps

The model defaults to `gemini-3.5-flash-lite`. You can change it with `GEMINI_MODEL`.

## Run locally on Windows

Open PowerShell in the repository folder (the folder containing `package.json`), then run:

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
```

In `.env.local`, replace the placeholder with your **private** key:

```text
GEMINI_API_KEY=your_new_private_key
GEMINI_MODEL=gemini-3.5-flash-lite
```

Save the file, then start the app:

```powershell
npm run dev
```

Open <http://localhost:3000>. Stop the local server with **Ctrl+C** in that PowerShell window. `.env.local` is ignored by Git; never add a key to source code or a `NEXT_PUBLIC_` variable.

To run the production build locally instead:

```powershell
npm run build
npm run start
```

## Upload this prepared project to GitHub

The local Git repository is initialized on branch `main` and has a prepared first commit. Create an **empty private repository** on GitHub; do not initialize it with a README, license, or Git ignore file. Then, from this project folder, add its URL and push:

```powershell
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
git push -u origin main
```

Replace the URL with the one GitHub shows for your repository. Check what is committed with `git status --short` and `git ls-files` before pushing. `.env.local`, `.next`, `node_modules`, and TypeScript build info are excluded; `.env.example`, source, and the lockfile are included.

For later code changes, commit and push them to trigger a new deployment:

```powershell
git add .
git commit -m "Describe your change"
git push
```

## Deploy a personal preview on Vercel

Vercel detects Next.js and reads the build settings from `package.json`, so this project does not need a custom build configuration. Follow Vercel's [Next.js deployment guide](https://vercel.com/docs/frameworks/full-stack/nextjs):

1. Sign in to Vercel with GitHub and import the repository you just pushed.
2. Keep the root directory at `.` and the detected Next.js build settings. The project targets Node `24.x`.
3. Before deploying, open **Project Settings → Environment Variables**. Add `GEMINI_API_KEY` with a newly issued key and `GEMINI_MODEL` with `gemini-3.5-flash-lite`. Do not prefix either name with `NEXT_PUBLIC_`.
4. Deploy and open the generated URL. Check the deployment build logs if it fails.
5. Push later changes to GitHub; Vercel builds and deploys the connected branch automatically.

Use Vercel Hobby only for a personal, non-commercial preview. For use by a real-estate business, choose a hosting plan whose terms allow commercial use. Render's free web services are also preview-only and can sleep after inactivity; see [Render's free-service limits](https://render.com/docs/free).

## App behavior

- Autofill suggests customer fields with supporting excerpts; review them before analysis.
- Analysis calculates the score in code from Timeline (30), Budget clarity (20), Requirement specificity (15), and Buying signals (35). The score is a prioritization estimate, not a sale prediction.
- The workspace supports follow-up messages, reviewable field updates, suggested replies, and import/export backups.
- Nothing is sent to customers automatically. Review all extracted details and replies.

## Checks

```powershell
npm run lint
npm run test
npx tsc --noEmit
npm run build
```
