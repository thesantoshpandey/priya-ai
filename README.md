# 🧬 Priya AI — NEET Companion Bot

AI-powered NEET preparation companion on Telegram. Built with Next.js, Supabase, and Google Gemini.

## What This Does

- Telegram bot that acts as a NEET Biology tutor and emotional companion
- Speaks in natural Hinglish (Hindi-English mix)
- Remembers every conversation (full chat history in database)
- Detects minors and triggers parental consent flow
- Admin dashboard to read all student conversations
- Graceful rate limit handling (doesn't crash when limits hit)

---

## Setup Guide (30 minutes)

### Step 1: Create accounts (all free)

1. **Telegram Bot**: Message @BotFather on Telegram → `/newbot` → Save the token
2. **Google AI Studio**: Go to https://aistudio.google.com/app/apikey → Create API key
3. **Supabase**: Go to https://supabase.com → New Project → Save URL and keys
4. **Vercel**: Go to https://vercel.com → Sign up with GitHub

### Step 2: Set up the database

1. Open your Supabase project dashboard
2. Go to **SQL Editor** → **New Query**
3. Copy the entire contents of `supabase/schema.sql` and paste it
4. Click **Run**
5. You should see "Success. No rows returned" — that's correct

### Step 3: Deploy to Vercel

1. Push this code to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. Go to https://vercel.com/new
3. Import your GitHub repository
4. In **Environment Variables**, add ALL variables from `.env.example`:
   - `TELEGRAM_BOT_TOKEN` — from BotFather
   - `TELEGRAM_WEBHOOK_SECRET` — make up any random string (e.g., "priya-ai-secret-2026")
   - `GEMINI_API_KEY` — from Google AI Studio
   - `GEMINI_MODEL` — set to `gemini-2.5-flash-lite` (cheapest, upgrade later)
   - `SUPABASE_URL` — from Supabase Settings > API
   - `SUPABASE_ANON_KEY` — from Supabase Settings > API
   - `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Settings > API (the secret one)
   - `ADMIN_PASSWORD` — make up a strong password for admin access
   - `NEXT_PUBLIC_APP_URL` — leave blank for now, update after deploy
5. Click **Deploy**
6. After deploy, copy your Vercel URL (e.g., `https://priya-ai-xyz.vercel.app`)
7. Go back to Vercel Settings > Environment Variables
8. Update `NEXT_PUBLIC_APP_URL` with your Vercel URL
9. Redeploy (go to Deployments tab → click "..." on latest → Redeploy)

### Step 4: Connect Telegram webhook

Open this URL in your browser (replace with your values):

```
https://YOUR-VERCEL-URL.vercel.app/api/telegram/setup?secret=YOUR_ADMIN_PASSWORD
```

You should see: `{"message":"Webhook setup attempted","telegramResponse":{"ok":true}}`

### Step 5: Test it

1. Open Telegram
2. Find your bot (search for the name you gave it in BotFather)
3. Send `/start`
4. Priya should respond!

### Step 6: Access admin dashboard

Go to: `https://YOUR-VERCEL-URL.vercel.app/admin`
Enter your ADMIN_PASSWORD to see all students and their conversations.

---

## Upgrading from Free to Paid Gemini (when you need it)

1. Go to https://aistudio.google.com
2. Click Settings → Enable Billing
3. Add a payment method
4. Set a daily budget cap (recommended: ₹1000/day)
5. That's it. Same API key, same code. Limits jump from 10 RPM to 300 RPM instantly.

Optional: Change `GEMINI_MODEL` in Vercel environment variables to `gemini-2.5-flash` for smarter responses (costs more per token).

---

## Architecture

```
Student (Telegram) → Telegram API → Vercel (Next.js API route) → Gemini AI
                                          ↕
                                      Supabase (PostgreSQL)
                                          ↕
                                    Admin Dashboard
```

## File Structure

```
priya-ai/
├── app/
│   ├── layout.tsx              # Root layout
│   ├── page.tsx                # Landing page
│   ├── admin/
│   │   └── page.tsx            # Admin dashboard (chat viewer)
│   └── api/
│       ├── telegram/
│       │   ├── route.ts        # Main webhook handler
│       │   └── setup/
│       │       └── route.ts    # One-time webhook registration
│       └── admin/
│           ├── users/
│           │   └── route.ts    # List all users + stats
│           └── chats/
│               └── [userId]/
│                   └── route.ts # View user's chat history
├── lib/
│   ├── supabase.ts             # Database operations
│   ├── gemini.ts               # AI with system prompt + rate limit handling
│   └── telegram.ts             # Telegram API helpers
├── supabase/
│   └── schema.sql              # Database schema (run once)
├── .env.example                # Environment variables template
├── package.json
├── tsconfig.json
└── next.config.js
```

## Costs (approximate)

| Service | Free Tier | When to Pay |
|---------|-----------|-------------|
| Telegram Bot API | Unlimited, forever free | Never |
| Google Gemini | ~1000 requests/day | 500+ students |
| Supabase | 500MB database, 50K rows | 10,000+ students |
| Vercel | 100GB bandwidth, serverless | Very high traffic |

---

## Next Steps (after MVP)

- [ ] WhatsApp integration (needs BSP account — Gupshup or Wati)
- [ ] Voice calling via Cartesia API (premium feature)
- [ ] OTP-based parental consent flow
- [ ] Product recommendation engine
- [ ] PWA for voice calls
- [ ] Payment integration (Razorpay) for voice credits
