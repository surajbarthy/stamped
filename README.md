# Slop Stamp

Don't like AI slop? Show it with a stamp. Stamp it anywhere you see it.

Slop Stamp is a Chrome extension. You turn it on, click something on a page that looks machine-made, and a red **AI slop** mark lands on it. Each stamp can save a picture of the page. Those pictures stay on your browser until you choose to download one, share one, or send one to the community wall.

There are no accounts. A community post is only the picture and the time it was taken. The page address, the page title, and anything that identifies you stay on this computer.

## What you can do

1. Click the Slop Stamp toolbar icon. The cursor becomes a crosshair and the toolbar badge says ON.
2. Click the part of the page you want to mark. A red stamp appears there, with the time under it.
3. Press Esc, or click the icon again, to leave stamp mode. The stamps and the bar stay until you leave or refresh the page.
4. Open Gallery from the bar to see every saved picture.

While stamp mode is on, a bar sits at the top of the page:

- A live count of stamps on this visit.
- **Saving on / Saving off.** Saving is on by default and the choice is remembered. With saving off, stamps still land, but no picture is taken.
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
- Send it to the community wall.
- Delete it, or delete every saved picture.
- Export a JSON backup. That file includes the page addresses and titles, because it is a local backup, not a public post.

## Community wall

Sharing to the community sends two fields: `createdAt` and `image`. The server ignores anything else. The wall shows the picture and a formatted time. **Randomize** shuffles the order.

The first six pictures are labeled samples so the wall is not empty before anyone shares. A real share shows up the same way: picture and time, nothing else.

The wall and the one-page site are served locally:

```bash
python3 site/server.py
```

Then open http://127.0.0.1:8787/ for the site and http://127.0.0.1:8787/community.html for the wall. The server has to be running for a community share to succeed. It listens only on this machine, keeps at most 200 posts, and writes them under `site/data/`.

## Install the extension

This is an unpacked extension. It is not in the Chrome Web Store yet. The **Add to Chrome** link on the site points at the store home until a listing URL exists.

1. Open `chrome://extensions`.
2. Turn on Developer mode.
3. Choose **Load unpacked** and select the `extension` folder in this repo.
4. After code changes, click the reload button on the extension card, then refresh any tabs that were already open.

The icon click works on normal `http` and `https` pages. It does not run on `chrome://` pages, and a click inside a cross-origin iframe does not place a stamp.

## How the pieces fit

```text
toolbar click
  -> stamp mode on the page
  -> click places an AI slop mark
  -> if saving is on, a JPEG of the viewport is stored locally
  -> the bar shows a thumbnail
  -> Gallery can download it, share the image, or post time + image
  -> the local site shows that post on the community wall
```

The extension has no popup, so clicking the icon goes straight to the background script. That script toggles stamp mode in the page and sets the ON badge. The content script places the mark, blocks the click from also activating whatever sits underneath it, and asks for the screenshot. The background script takes the picture with `chrome.tabs.captureVisibleTab` as a JPEG, so the save stays small enough to succeed.

## Layout of the repo

- `extension/` — Manifest V3 extension: stamp mode, local gallery, icons.
- `site/` — marketing page, community wall, and the Python server.
- `site/data/` — community index and images, including the six samples.
- `PLAN.md` — build log of what shipped and what is still waiting.

## Still waiting

- A real Chrome Web Store listing URL.
- A public address for the community server. Until then, the gallery posts to `http://127.0.0.1:8787`.
