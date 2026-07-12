# DebtPilot

DebtPilot is a weekly-pay financial command center and debt decision engine.

## Included in this build

- Weekly cash-flow recommendation
- Avalanche and snowball debt prioritization
- Editable debt accounts
- Financial health score
- Vehicle affordability calculator
- Supabase-ready client and SQL schema
- Responsive Next.js dashboard

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Connect Supabase

1. Copy `.env.example` to `.env.local`.
2. Add your Supabase project URL and publishable key.
3. Open the Supabase SQL Editor and run `supabase/schema.sql`.
4. Authentication and database persistence are scaffolded but not yet wired into the UI.

## Deploy to Vercel

Import the GitHub repository into Vercel. Add the same Supabase environment variables in Vercel project settings, then deploy.
