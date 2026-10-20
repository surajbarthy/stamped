# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste.

## Before you submit

- Register as a Chrome Web Store developer at https://chrome.google.com/webstore/devconsole (one-time $5 fee).
- Deploy the wall and set `COMMUNITY_ORIGIN` in `extension/config.js` (see `cloud/DEPLOY.md`).
- Bump `version` in `extension/manifest.json` for every upload.
- Zip the extension folder's contents, so `manifest.json` sits at the top of the zip: `cd extension && zip -r ../slop-stamp.zip . -x '.*'`
- Optional but worth it: verify your domain in the dashboard (Account > Verified publisher) so the listing shows it as the official site.

## Store listing tab

**Name:** Slop Stamp

**Summary (132 characters max):**
Don't like AI slop? Show it with a stamp. Keep a private gallery, and post the best ones to a public wall.

**Category:** Fun (or Social & Communication)

**Description:**

Don't like AI slop? Show it with a stamp.

Click the icon, click the slop, and a red mark lands right on it. Every stamp keeps a picture in your private gallery. Post the best ones to the wall.

How it works
1. Click the icon, then the slop.
2. A stamp lands and a picture saves to your gallery.
3. Press Esc when you're done.
4. Post the best ones to the wall at slopstamp.xyz, where others see them.

Yours, until you share it
Your pictures stay on your computer, in this browser. Nothing is uploaded unless you post it.
Before you post one to the wall, black out anything private, like a name or an email. The wall gets only the picture and the time, and you can take it down from your gallery.

No accounts. No names. A picture and a time.

**Homepage URL:** https://slopstamp.xyz
**Support URL:** mailto:report@slopstamp.xyz (or the privacy page)

**Images** (all in `store/images/`):
- Store icon (128×128): `store-icon-128.png`. The stamp at 96×96 with 16px clear space, per the icon guidelines.
- Screenshots (1280×800, no alpha), in this order: `screenshot-1-stamp.png`, `screenshot-2-gallery.png`, `screenshot-3-cover-up.png`, `screenshot-4-wall.png`, `screenshot-5-home.png`. Each has a one-line caption in Comic Sans over the real UI.
- Small promo tile (440×280): `small-promo-440x280.png`.
- Marquee promo tile (1400×560): `marquee-promo-1400x560.png`.

The screenshots come from the real extension on made-up pages with AI-generated pictures, so no real site or person appears.

## Privacy practices tab

**Single purpose:**
Lets the user mark AI-generated content on web pages with a visual stamp and keep pictures of the pages they stamped.

**Permission justifications:**
- `activeTab`: when the user clicks the toolbar icon, the extension gets access to that one tab so it can place stamps and take a picture of the visible page. It has no access to any other tab or site.
- `scripting`: injects the stamp script and style into the tab the user clicked the icon on.
- `storage`: keeps the user's saved pictures and the saving on/off setting in the browser.
- `unlimitedStorage`: saved pictures are screenshots, and 100 of them exceed the default storage quota.

**Remote code:** No, I am not using remote code.

**Data usage**, what to tick:
- **Website content**: yes. Only when the user chooses to post a picture to the wall, that one picture (a screenshot of a page they stamped, with any parts they covered blacked out) is sent to our server.
- Everything else (personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity): no. Page addresses and titles stay on the device.

**Certifications** (tick all three; they're true):
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://slopstamp.xyz/privacy

## Listing

Approved 2026-10-20: https://chromewebstore.google.com/detail/slop-stamp/cecjagoocjflopjaniepomhdcohiaopo
Every Add to Chrome button on the site points here.
