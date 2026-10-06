# Putting the wall online

The site, the wall and its upload API run as one Cloudflare Worker. Pictures go in R2, the post list and moderation state in D1. All of it fits in Cloudflare's free tier at launch.

Replace `stamp.yourdomain.com` below with the address you want the wall on.

## 1. Cloudflare account and domain (only you can do this)

1. Sign up at https://dash.cloudflare.com/sign-up.
2. **Add a domain**, choose the Free plan, and follow the prompt to change your domain's nameservers at your registrar to the two Cloudflare gives you. Your existing records are copied over. The domain shows as Active once the change has spread, often within the hour.
3. Open **R2** in the sidebar and turn it on. Cloudflare asks for a payment method here even on the free tier; the first 10 GB and all downloads are free.

## 2. Create the database, bucket and admin key

From this folder (`cloud/`):

```bash
npm install
npx wrangler login                     # opens a browser to approve
npx wrangler d1 create stamped         # prints a database_id
```

Paste that `database_id` into `wrangler.jsonc`, replacing the zeros. Then:

```bash
npx wrangler r2 bucket create stamped-media
npm run db:remote                      # creates the tables
openssl rand -base64 32                # copy this: it's your admin key
npx wrangler secret put ADMIN_TOKEN    # paste the key when asked
```

Keep the admin key in your password manager. It's the only login for the moderation page.

## 3. Deploy on your domain

In `wrangler.jsonc`, uncomment the `routes` line and put in your address:

```jsonc
"routes": [{ "pattern": "stamp.yourdomain.com", "custom_domain": true }]
```

Then:

```bash
npm run deploy
node test/smoke.mjs https://stamp.yourdomain.com YOUR_ADMIN_KEY
```

The smoke test posts a picture, approves, reports and removes it, and leaves the wall as it found it. It should end with `all smoke checks passed`.

Open `https://stamp.yourdomain.com/admin`, paste the admin key, and you'll see the moderation page.

## 4. Point the extension and pages at it

- `extension/config.js`: set `COMMUNITY_ORIGIN` to `https://stamp.yourdomain.com`.
- `site/privacy.html`: replace `report@example.com` with your address.
- In Cloudflare, **Email > Email Routing** can forward `report@yourdomain.com` to your inbox for free.

Then `npm run deploy` again so the privacy page update goes live.

## Moderating

- New posts wait under **Waiting** until you approve them. Nothing is public before that.
- Three reports on a live post hide it until you look. Approving it again clears the reports.
- **Delete for good** removes the picture from storage.
- The checkbox at the top switches between approving first and publishing instantly. Leave it on at launch.

If you ever see child sexual abuse material, delete it and report it to NCMEC at https://report.cybertip.org (US law requires providers to report it). Cloudflare's CSAM Scanning Tool only checks images that pass through its cache, and the wall serves pictures through the Worker, so don't count on it here; the approval queue is the real safeguard.

## Running it locally

```bash
cd cloud
npm install
npm run db:local
echo 'ADMIN_TOKEN=local-admin-key' > .dev.vars
npm run dev
```

The site is then at http://127.0.0.1:8787, which is also the extension's default `COMMUNITY_ORIGIN`, so the unpacked extension posts to it. `npm test` runs the image checks; `node test/smoke.mjs` runs the API checks against the local Worker (posting is limited to five a minute, so wait a minute between runs).

## Limits

- Posts are limited to 5 a minute per address and reports to 10 a minute. Cloudflare sees the address to enforce this; the Worker never stores it.
- At most 300 posts can wait for approval at once. Past that, new posts are turned away until you catch up.
- Pictures must be JPEG or PNG, under 4 MB, between 64 and 8000 pixels on a side. EXIF and text metadata are stripped before storage.
- The wall shows the newest 200 approved posts.
