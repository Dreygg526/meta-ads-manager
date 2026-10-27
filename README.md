# Ads Manager

A self-hosted, read-only Meta Ads Manager. It talks to Meta through the Marketing API, so your
team can watch every ad account on one page **without logging in to a Facebook profile**.
That means no new-device or travel login flags, and no sharing Facebook access with VAs.

- Campaigns / Ad sets / Ads tabs, account switcher, All / Active / Had delivery filters,
  search by name or ID, date presets and custom ranges.
- Columns: Results (purchases), Reach, Impressions, Cost per result, Amount spent, CPC, CTR,
  CPM, Cost per add to cart, **Hook Rate** (3-second video views ÷ impressions), Budget.
  Sortable, with a totals row. Ads show thumbnails and a preview link.
- Invite-only sign-in by email link (Supabase). Admins manage the team; everyone else is view-only.
- The Meta token stays on the server and never reaches the browser.

Editing (on/off and budgets) is built but **off by default**. Set `ADS_EDITING=on` to enable it
for admins. The token's user then needs the Advertiser role on the ad accounts. Every change is
logged on the History page.

## Setup

1. **Meta token:** a System User token (Business Settings → System Users) with `ads_read`
   is best, because it never expires. A long-lived user token also works.
2. **Supabase:** create a project, run `supabase/schema.sql` in the SQL editor with your
   email as the first admin, and set Authentication → URL Configuration → Site URL to your
   deployed address.
3. **Environment variables** (`.env.local`, and the same in Vercel):

   ```
   META_ACCESS_TOKEN=
   META_API_VERSION=v25.0
   META_ACCOUNT_IDS=        # comma-separated ids without act_; empty = every active account
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   ADS_EDITING=             # "on" to allow on/off + budget changes
   ```

4. `npm install` then `npm run dev`. With no Supabase variables, `next dev` signs you in as a
   local admin so you can try it.

Built with Next.js 16, React 19, Tailwind 4 and Supabase.
