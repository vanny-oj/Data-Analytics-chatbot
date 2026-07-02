# Deploying "Query" with Accounts + Paystack Credits

This version requires email signup. Each new account gets 5 free questions, then
must buy a credit pack via Paystack to keep going.

## Overview of what you're connecting
- **Supabase** — handles user accounts (email/password) and stores credit balances
- **Paystack** — handles payment collection
- **Vercel** — hosts the website and the backend functions
- **Anthropic** — powers the actual chatbot answers

None of these need your card details beyond what's normal for a business —
Paystack is the only one that touches customer payments.

---

## Step 1 — Set up Supabase
1. Go to https://supabase.com → create a free account → **New Project**
2. Pick a name and a database password (save the password somewhere safe)
3. Once the project is ready, go to **SQL Editor** in the sidebar
4. Open `supabase-schema.sql` (included in this project) and paste its full contents into the SQL editor, then click **Run**
   - This creates the `user_credits` table, the `payments` table, and a trigger that gives every new signup 5 free credits automatically
5. Go to **Project Settings → API**. You'll need three values for later:
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep this one very private — it can bypass all security rules)
6. Go to **Authentication → Providers** and make sure **Email** is enabled (it is by default)
7. Go to **Authentication → Email Templates / URL Configuration** and consider turning OFF "Confirm email" while testing, so you can sign up and test instantly without checking an inbox. Turn it back on before going live.

## Step 2 — Set up Paystack
1. Go to https://paystack.com → sign up for a free business account
2. Complete whatever business verification they ask for (this can take a little time — start this early)
3. Go to **Settings → API Keys & Webhooks**
4. Copy your **Secret Key** (starts with `sk_test_` while in test mode, `sk_live_` once approved for live payments)
5. While still in test mode, you can test the whole flow with Paystack's test cards before risking real money — see https://paystack.com/docs/payments/test-payments
6. In the same settings page, set your **Webhook URL** to:
   `https://YOUR-VERCEL-DOMAIN.vercel.app/api/paystack-webhook`
   (you'll fill in the real domain after Step 4's first deploy, then come back and update this)

## Step 3 — Push the code to GitHub
1. Create a new repo on https://github.com (e.g. `query-chatbot`)
2. Upload all the files from this project folder into that repo

## Step 4 — Deploy to Vercel
1. Go to https://vercel.com → sign up with GitHub → **Add New → Project**
2. Select your repo, leave build settings as default (Vite is auto-detected)
3. Before deploying, add these **Environment Variables** in the project settings:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `SUPABASE_URL` | your Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service_role key |
| `VITE_SUPABASE_URL` | same Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |
| `PAYSTACK_SECRET_KEY` | your Paystack secret key |
| `SITE_URL` | your future Vercel URL, e.g. `https://query-chatbot.vercel.app` |

   Note: `VITE_`-prefixed variables are the only ones exposed to the browser — that's expected and safe, the anon key is designed to be public. Never put the service role key or Paystack secret key behind a `VITE_` prefix.

4. Click **Deploy**
5. Once deployed, copy your live URL and:
   - Update `SITE_URL` in Vercel's environment variables to match it exactly, then redeploy
   - Go back to Paystack's webhook settings and set the webhook URL using this real domain

## Step 5 — Test the whole flow
1. Open your live site, sign up with a real email
2. Ask a question — confirm it answers and your credit count drops
3. Ask until credits hit 0 — confirm the buy-credits screen appears
4. Buy a pack using a Paystack **test card** (while still in test mode) — confirm you're redirected back and credits update within a few seconds
5. Only switch your Paystack key to live mode once this all works in test mode

## Pricing — change anytime
Credit pack prices and sizes live in `/api/create-payment.js` in the `CREDIT_PACKS` object,
and the displayed labels are in `/src/components/BuyCredits.jsx`. Edit both together if you
change pricing, then push to GitHub — Vercel redeploys automatically.

## A note on margins
Anthropic charges per API call based on length of conversation. Keep an eye on
https://console.anthropic.com usage so your credit pricing comfortably covers API costs —
the current defaults (₦500/20 questions, ₦1,000/50, ₦2,000/120) are a reasonable starting
point but test against your actual usage and adjust.

## If something breaks
- Sign up fails silently → check Supabase email confirmation setting (Step 1.7)
- Chat says "Invalid session" → access token issue, try logging out and back in
- Credits don't update after payment → check the Vercel function logs for `/api/paystack-webhook`, and confirm the webhook URL in Paystack settings matches your real domain exactly
- "Could not start payment" → check `PAYSTACK_SECRET_KEY` is set correctly in Vercel
