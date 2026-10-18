# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste.

## Before you submit

- Register as a Chrome Web Store developer at https://chrome.google.com/webstore/devconsole (one-time $5 fee).
- Deploy the wall and set `COMMUNITY_ORIGIN` in `extension/config.js` (see `cloud/DEPLOY.md`).
- Bump `version` in `extension/manifest.json` for every upload.
- Zip the extension folder's contents: `cd extension && zip -r ../slop-stamp.zip . -x '.*'`
- Optional but worth it: verify your domain in the dashboard (Account > Verified publisher) so the listing shows it as the official site.

## Store listing tab

**Name:** Slop Stamp

**Summary (132 characters max):**
Stamp AI slop where you see it. Keep a private gallery of what you stamped, and post the best ones to a public wall.

**Category:** Fun (or Social & Communication)

**Description:**

Stamp AI slop where you see it

Click the Slop Stamp icon, then click anything on the page that looks like AI slop. A red stamp lands on it, and a picture of the page goes into your gallery. Press Esc or click the icon again to stop.

Your private gallery

Every stamp saves a picture of the page with the stamp in it. The gallery lives only in this browser. Download a picture, share it, or delete it. Turn saving off when you only want to mark.

The public wall

If you want, post a picture to the wall at slopstamp.xyz. Before it goes, black out anything private, like a name or an inbox. The wall gets only the picture and the time, and a person checks it before it shows. You can take it down from your gallery at any time.

Privacy assurance

No accounts, no tracking, no ads. Slop Stamp only runs on a tab after you click its icon there, and page addresses and titles never leave your device.

**Homepage URL:** https://slopstamp.xyz
**Support URL:** mailto:report@slopstamp.xyz (or the privacy page)

**Images:**
- Icon: `extension/icons/icon128.png`
- Screenshots: 1 to 5 at 1280×800 or 640×400. Suggested: a stamped page with the bar, the gallery grid, the cover-up step before posting, and the wall.
- Small promo tile: 440×280 PNG (required).

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

## After it's approved

Replace the Add to Chrome link in `site/index.html` (currently the Chrome Web Store home page) with the listing URL, then `npm run deploy` from `cloud/`.
