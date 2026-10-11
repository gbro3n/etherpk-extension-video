# Videos for EtherPK

An [EtherPK](https://etherpk.com) extension that plays YouTube and Vimeo videos in your documents.
Paste a link to a video on a line of its own, or type `/video`, and the video appears in the
document as a card you can play.

Published by `gbro3n`. This is not an extension from App Software, the makers of EtherPK.

## What it does

- **Paste a link.** Paste a link to one YouTube or Vimeo video on an empty line or an empty bullet,
  and it becomes a video. Press Mod+Z straight after to get the plain link back. A link pasted
  inside text stays a link.
- **`/video`.** Type `/video` in a document and paste the link into the box that opens. It works on
  phones too.
- **Play.** A video shows as a card with its picture and title. Nothing loads from YouTube or Vimeo
  until you press play. YouTube videos play from `youtube-nocookie.com`.
- **Open the video's own page.** Under every video, a link opens it on YouTube or Vimeo. Use it when
  a video won't play in the document. Some Vimeo videos play only on sites their owner chose.
- **Published sites.** On a site you publish from EtherPK, a video is its picture and title linking
  to the video's page. The site holds no player.

These links work: single YouTube videos (`watch?v=`, `youtu.be/`, `/shorts/`, `/live/` and
`/embed/` links, on `www.`, `m.` and `music.youtube.com`) and Vimeo videos by number, including
unlisted ones. A `t=` in the link sets where the video starts. A YouTube Short is shown upright.
Playlists and channels stay as links.

## Settings

Settings, then Extensions, then Videos:

- **Show video thumbnails** (on unless you turn it off). Before a video plays, its card shows the
  video's picture and title. Fetching them tells YouTube or Vimeo your IP address and which video is
  in your notes. Turn it off and the card is plain, and nothing is sent until you press play. The
  picture and title are kept on your device for 30 days, so a document you open again sends nothing.

## How a video is stored

A video is a fenced block with `video` as its info word, holding the link as you pasted it:

````markdown
```video
https://www.youtube.com/watch?v=abcDEF12_-3
```
````

Without this extension, EtherPK and any other Markdown app show it as a code block holding the
link, so you never lose the video. You can edit the link by hand: put the caret on the block's lines
to see its text.

## Terms

- **Video block**: the `video` fenced block above, and the card the extension draws for it.
- **Card**: a video before it plays: its picture, title and play button, with the provider's name
  and a link to the video's page under it.

## Installing

EtherPK can't install extensions from other publishers yet. The EtherPK Extension Directory, where
they will be listed, is being built. Until then you can run this extension in a development copy of
the EtherPK Client (below).

## Development

You need Node 24 and pnpm, and a checkout of the EtherPK repository beside this one (`../etherpk`).

```bash
pnpm install
pnpm build          # dist/main.js and dist/main.css
pnpm test           # unit tests
pnpm check          # type check
pnpm test:e2e       # browser tests, against a Client that loads this extension
```

To try it in a Client, build it and start the Client's development server with the extension's
folder in `ETHERPK_DEV_EXTENSIONS` (an absolute path, or one relative to the Client's
`apps/client` folder):

```bash
pnpm dev            # rebuilds dist/ on every change
# in the EtherPK checkout:
ETHERPK_DEV_EXTENSIONS=/path/to/etherpk-extension-video pnpm dev:client
```

The browser tests start their own Client from `ETHERPK_CLIENT_DIR` (`../etherpk` when unset) on
port 5396. On a system where Playwright's own Chromium won't start, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to another Chromium. The tests answer every YouTube and Vimeo
address themselves, so they never reach either service.

The extension is written against
[`@appsoftwareltd/etherpk-extension-api`](https://www.npmjs.com/package/@appsoftwareltd/etherpk-extension-api).
It uses `context.editor.registerFence` (the widget, the paste and the published card),
`context.dialogs.prompt`, `context.editor.insertBlock`, `context.embeds.frame` (the player, which
the Client builds) and `context.settings`.

## Licence

MIT. See [LICENSE](LICENSE).
