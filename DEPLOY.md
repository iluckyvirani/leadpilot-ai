# Publish to GitHub and deploy to Vercel (step by step)

Run these yourself. Nothing has been pushed or deployed.

## 1. Check before going public
- `.env` is git-ignored. Confirm with `git status` after `git add` that it is not listed.
- README and seed data contain no real keys, leads or company names.

## 2. Create the public GitHub repo
```powershell
cd D:\Xamp\phpMyAdmin\tmp\twig\51\me\ai-project
git init -b main
git add .
git status
git commit -m "LeadPilot AI: Claude tool-use sales agent"
```
Create an empty public repo named `leadpilot-ai` at https://github.com/new (no README), then:
```powershell
git remote add origin https://github.com/iluckyvirani/leadpilot-ai.git
git push -u origin main
```

## 3. Create a hosted Postgres
Neon (https://neon.tech) → New project → copy the **pooled** connection string (it ends with `?sslmode=require`).

## 4. Deploy on Vercel
1. https://vercel.com/new → Import `leadpilot-ai`.
2. Environment variables: `DATABASE_URL` (Neon), `ANTHROPIC_API_KEY`, `APP_PASSWORD` (required, protects your credits), `CRON_SECRET` (any long random string), and optionally `SENDER_*`.
3. Deploy. `npm run build` runs `prisma generate` automatically.

## 5. Create tables and demo data on Neon (once, from your PC)
```powershell
$env:DATABASE_URL="<your Neon URL>"; npx prisma migrate deploy; npm run db:seed
```

## 6. Finish
- Open the Vercel URL, log in with `APP_PASSWORD`, run the "Research & draft" preset.
- Record `docs/demo.gif`, commit it, and push. Add the live URL to the repo's About section.
- Cron runs daily (see `vercel.json`).
