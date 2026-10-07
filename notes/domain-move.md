# Moving to www.abcsightreading.com

From www.abc-sightreading.com, with the bare domain and every old address redirecting. Decided on 7 October 2026:
- **Main address:** www.abcsightreading.com.
- **Dev site:** dev.abcsightreading.com.
- **Email:** stays on send.abc-sightreading.com for now.

The code is ready on the local branch `domain-move` (commit e4737f2, not pushed). It changes:
- the site address, so every canonical link, the sitemap, robots.txt and structured data follow;
- the copyright line and Choral's composer field, and the snapshot that pins them;
- the /admin affiliate links and the school quote email;
- sign-in, which trusts the new addresses and the old ones;
- `src/middleware.ts`, which redirects with a permanent 308 to the same page and query:
  - abc-sightreading.com, www.abc-sightreading.com, abcsightreading.com and abc.blainecowen.com go to https://www.abcsightreading.com;
  - dev.abc-sightreading.com goes to dev.abcsightreading.com;
  - except the Stripe webhook and the cron, which keep answering at the old address until they are moved.

Do the steps in order. Nothing changes for users until step 4.

## 1. Vercel: add the domains (about 5 minutes)

1. In the **abc-sightreading** project, go to **Settings → Domains → Add**.
2. Add **www.abcsightreading.com** and connect it to **Production**.
3. Add **abcsightreading.com**. When Vercel offers to redirect it to www, accept, or leave it and let the middleware do it.
4. Add **dev.abcsightreading.com** and connect it to the **dev** branch (Git Branch: `dev`), as dev.abc-sightreading.com is now.
5. Leave the old domains where they are. They must keep serving the project so they can redirect.

Vercel shows the DNS records each domain needs. They are usually:

| Type | Host | Value |
|---|---|---|
| A | `@` (abcsightreading.com) | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |
| CNAME | `dev` | `cname.vercel-dns.com` |

Use the values Vercel shows if they differ.

## 2. Porkbun: DNS for abcsightreading.com

1. Under **Domain Management → abcsightreading.com → DNS**, add the records from step 1.
2. Delete Porkbun's default parking records (an ALIAS or A on `@` and a CNAME `*` pointing at Porkbun), or they will conflict.
3. Wait until Vercel shows **Valid Configuration** on all three domains. It is often minutes, sometimes an hour. It also issues the HTTPS certificates.
4. Check: https://www.abcsightreading.com opens the site (the old code, which is fine for now).

## 3. Settings that must name the new address before the code goes live

1. **Vercel environment variables** (Settings → Environment Variables):
   - Production `BETTER_AUTH_URL` = `https://www.abcsightreading.com`
   - Preview (dev) `BETTER_AUTH_URL` = `https://dev.abcsightreading.com`
2. **Google sign-in** (Google Cloud Console → APIs & Services → Credentials → the OAuth client). Add these, keeping the old ones for now:
   - Authorised JavaScript origins: `https://www.abcsightreading.com` and `https://dev.abcsightreading.com`
   - Authorised redirect URIs: `https://www.abcsightreading.com/api/auth/callback/google` and `https://dev.abcsightreading.com/api/auth/callback/google`
3. **Stripe** (Dashboard → Developers → Webhooks), in live and sandbox:
   - Add an endpoint at `https://www.abcsightreading.com/api/auth/stripe/webhook` with the same events as the current one.
   - Copy its **signing secret** into Vercel's `STRIPE_WEBHOOK_SECRET` for Production (and the sandbox one for Preview).
   - Keep the old endpoint enabled until step 5. The middleware leaves it unredirected, so nothing is missed in between.
   - Check the Customer Portal and Checkout settings for a return URL that names the old domain.

## 4. Ship the code (dev first, as always)

1. `git checkout grading && git merge domain-move`, then push to `dev` with `[preview]` in the commit message.
2. On **dev.abcsightreading.com**, check:
   - sign in with email, and with Google;
   - a page's source shows `<link rel="canonical" href="https://www.abcsightreading.com/...">`;
   - https://dev.abc-sightreading.com/sightreading redirects to the same page on dev.abcsightreading.com.
3. Push to `main`. Then check on production:
   - https://www.abc-sightreading.com/pricing?x=1 lands on https://www.abcsightreading.com/pricing?x=1 (status 308);
   - https://abcsightreading.com lands on www;
   - https://www.abcsightreading.com/sitemap.xml lists only new addresses, and `/robots.txt` points at the new sitemap;
   - sign in works, and a test checkout (sandbox) reaches the new webhook.

Anyone signed in on the old domain is signed out once, because the login cookie belongs to the domain.

## 5. Tidy up (a few days later)

1. **Stripe:** once the new endpoint has delivered events for a few days, disable the old one.
2. **Search Console:**
   - Add a Domain property for **abcsightreading.com**, verified by DNS TXT at Porkbun, and submit `https://www.abcsightreading.com/sitemap.xml`.
   - On the **old** property, use **Settings → Change of address** to name the new site.
   - Do this even though little is indexed yet; it moves what there is.
3. **Everywhere the address is written by hand:**
   - the promo video description;
   - social profiles;
   - Stripe's public business details and receipts;
   - the Better Auth email templates (they use `BETTER_AUTH_URL`, so they follow on their own);
   - the business notes in Obsidian, and the memory notes.
4. **Keep the old domain registered and pointed at Vercel for at least a year.** Links, bookmarks and search results depend on its redirects.
5. **Email (later):** add send.abcsightreading.com in Resend and its DNS records at Porkbun. Then change `DEFAULT_FROM` in `src/lib/server/auth-email.ts` and `src/pages/api/feedback.ts`.
6. **CLAUDE.md:** update the SEO and Deploys sections (the domain, the dev site and the CNAME), and add a line about these redirects.

## Then the search work

Once the move has settled, this is the work from the 7 October discussion:
- put "Sight Reading Generator" in the titles, descriptions and main headings of the home page and both generator pages;
- add 300 to 500 words of text Google can read below each generator (they are drawn by JavaScript, so Google now sees 27 to 44 words), with an FAQ;
- add landing pages for sight singing, rhythm and choir sight reading generators;
- get the YouTube video and links from teachers.
