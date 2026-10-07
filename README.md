# Slop Stamp

Don't like AI slop? Show it with a stamp. Stamp it anywhere you see it.

Slop Stamp is a Chrome extension. You turn it on, click something on a page that looks machine-made, and a red **AI slop** mark lands on it. Each stamp can save a picture of the page. Those pictures stay on your browser until you choose to download one, share one, or send one to the wall.

There are no accounts. A wall post is only the picture and the time it was taken. The page address, the page title, and anything that identifies you stay on this computer.

## What you can do

1. Click the Slop Stamp toolbar icon. The cursor becomes a crosshair and the toolbar badge says ON.
2. Click the part of the page you want to mark. A red stamp appears there, with the time under it.
3. Press Esc, or click the icon again, to leave stamp mode. The stamps and the bar stay until you leave or refresh the page.
4. Open Gallery from the bar to see every saved picture.

While stamp mode is on, a bar sits at the top of the page:

- A live count of stamps on this visit.
- **Save to gallery.** A checkbox in the bar, on by default, and the choice is remembered. With it off, stamps still land, but no picture is taken.
- **Gallery.** Opens the private gallery in a tab.
- Thumbnails of the pictures taken during this visit. Delete a thumbnail and that picture is removed from the gallery too.

Stamps are session-only. They are not redrawn after a refresh. The screenshot is the record, because trying to pin a mark back onto a page after the layout moves is a different, much larger problem.

## Private gallery

Saved pictures live in `chrome.storage.local` on this browser. The newest 100 are kept. The 101st save drops the oldest.

Each picture stores the time, the page address, the page title, the site name, how many stamps were on the page, and the image. That detail never leaves the browser unless you export it yourself.

From a picture you can:

- Open it full size.
- Download it.
- Share the image through the system share sheet, or copy it if that is not available.
- Send it to the wall, after blacking out anything private in it.
- Take it back off the wall.
- Delete it, or delete every saved picture.
- Export a JSON backup. That file includes the page addresses and titles, because it is a local backup, not a public post.

## Community wall

Posting to the wall is a choice made one picture at a time. Before a picture goes, the gallery lets you drag boxes over anything private, like a name or an inbox, and those parts are blacked out in the posted copy. Your saved copy stays as it was.

The post sends two fields: `createdAt` and the picture. The server strips metadata from the image, stores it, and gives the gallery a removal key, so **Remove from the wall** in the gallery deletes it again. Nothing about the poster is stored.

New posts wait for a person to approve them on the moderation page (`/admin`). Anyone can report a picture on the wall, and three reports hide it until it's looked at. A switch on the moderation page lets posts go live instantly instead.

The site, the wall and the API run as one Cloudflare Worker, in `cloud/`. To run them locally:

```bash
cd cloud
npm install
npm run dev
```

`npm run dev` creates the local database tables and a local admin key the first time. The old `python3 site/server.py` is gone; this replaces it.

Then open http://127.0.0.1:8787/ for the site, http://127.0.0.1:8787/wall for the wall, and http://127.0.0.1:8787/admin (key `local-admin-key`) to approve posts. To have the unpacked extension post there, set `COMMUNITY_ORIGIN` in `extension/config.js` to `http://127.0.0.1:8787`. `cloud/DEPLOY.md` covers putting it on a real domain.

## Install the extension

This is an unpacked extension. It is not in the Chrome Web Store yet. The **Add to Chrome** link on the site points at the store home until a listing URL exists.

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select the `extension` folder in this repo.
4. The wall address is in `extension/config.js`. It points at the local Worker until you change it.
5. After code changes, click the reload button on the extension card, then refresh any tabs that were already open.

The extension asks for no site access up front. Clicking the icon gives it access to that one tab until the tab navigates away, which is enough to stamp and take pictures there. The icon click works on normal `http` and `https` pages. It does not run on `chrome://` pages, and a click inside a cross-origin iframe does not place a stamp.

## How the pieces fit

```text
toolbar click
  -> stamp mode on the page
  -> click places an AI slop mark
  -> if saving is on, a JPEG of the viewport is stored locally
  -> the bar shows a thumbnail
  -> Gallery can download it, share the image, or cover private parts and post time + image
  -> a person approves it on /admin
  -> the wall shows it, until the poster removes it or reports hide it
```

The extension has no popup, so clicking the icon goes straight to the background script. That script toggles stamp mode in the page and sets the ON badge. The content script places the mark, blocks the click from also activating whatever sits underneath it, and asks for the screenshot. The background script takes the picture with `chrome.tabs.captureVisibleTab` as a JPEG, so the save stays small enough to succeed.

## Layout of the repo

- `extension/` — Manifest V3 extension: stamp mode, local gallery, icons.
- `site/` — marketing page, the wall, moderation page and privacy policy (static files).
- `cloud/` — the Cloudflare Worker that serves `site/` and the wall API, its database schema, tests, and `DEPLOY.md`.
- `store/LISTING.md` — Chrome Web Store listing text, permission reasons and privacy answers.
- `PLAN.md` — build log of what shipped and what is still waiting.

## Still waiting

- A Cloudflare account and the domain pointed at it, then the steps in `cloud/DEPLOY.md`.
- A real Chrome Web Store listing URL for the Add to Chrome link (see `store/LISTING.md`).
