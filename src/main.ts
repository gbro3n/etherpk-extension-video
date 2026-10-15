/**
 * Videos: YouTube and Vimeo videos in EtherPK documents.
 *
 * A video is a fence holding the video's link as it was pasted:
 *
 * ````markdown
 * ```video
 * https://www.youtube.com/watch?v=abcDEF12_-3
 * ```
 * ````
 *
 * Without this extension the fence reads as a code block holding a link, so a document never loses
 * the video. The extension adds four things through the EtherPK Extension API:
 *
 * - a widget over each `video` fence (`context.editor.registerFence`), drawn as a card until the
 *   person presses play (`widget.ts`);
 * - a video link pasted on its own becomes a video (the registration's `fromPaste`), and Mod+Z
 *   straight after turns it back into the link;
 * - `/video`, which asks for a link in a dialog the Client draws (`context.dialogs.prompt`) and puts
 *   the video at the caret (`context.editor.insertBlock`);
 * - on a published site, a video is its picture and title linking to the video's page, with no
 *   player (the registration's `publish`);
 * - where a reference quotes the video, in the Backlinks panel and beneath a document, the same link,
 *   with the picture and title only while the Show video thumbnails setting is on (the
 *   registration's `quote`).
 */
import type { ExtensionContext, PublishedFence } from '@appsoftwareltd/etherpk-extension-api'

import { createDetails } from './details'
import { parseVideoLink, providerName } from './links'
import './styles.css'
import { createVideoWidget } from './widget'

export const VIDEO_FENCE = 'video'
export const INSERT_COMMAND = 'video.insert'
const THUMBNAILS = 'thumbnails'

export function activate(context: ExtensionContext): void {
    const details = createDetails(context.storage)
    const thumbnails = () => context.settings.get(THUMBNAILS) !== 'false'

    /**
     * A video as a link to its page, for a published site and for a quote of it: with its picture and
     * title when `withDetails`, which fetches them the first time, and otherwise the link alone.
     */
    async function videoCard(body: readonly string[], withDetails: boolean): Promise<PublishedFence | null> {
        const link = parseVideoLink(body.find((line) => line.trim() !== '') ?? '')
        if (!link) return null
        const name = providerName(link.provider)
        if (!withDetails) return { kind: 'link', href: link.page, text: `Watch on ${name}` }
        const known = await details(link)
        const thumbnail = link.provider === 'youtube' ? `https://i.ytimg.com/vi/${link.id}/hqdefault.jpg` : known?.thumbnail
        return {
            kind: 'link',
            href: link.page,
            text: known?.title ? `${known.title} (${name})` : `Watch on ${name}`,
            ...(thumbnail ? { image: { src: thumbnail, alt: known?.title ?? `${name} video` } } : {}),
        }
    }

    context.editor.registerFence(
        VIDEO_FENCE,
        createVideoWidget({
            thumbnails,
            subscribeSettings: (listener) => context.settings.subscribe(listener),
            details,
            frame: (options) => context.embeds.frame(options),
            notify: (message) => context.notify(message),
        }),
        {
            title: 'Video',
            // A video link pasted on its own, with nothing else, becomes the video.
            fromPaste: (text) => {
                const link = text.trim()
                return parseVideoLink(link) ? [link] : null
            },
            publish: (fence) => videoCard(fence.body, true),
            // A quote reaches YouTube or Vimeo only as a card in the document would: while the
            // person lets cards fetch a picture and a title.
            quote: (fence) => videoCard(fence.body, thumbnails()),
        },
    )

    context.commands.register(INSERT_COMMAND, async () => {
        const link = await context.dialogs.prompt({
            title: 'Insert a video',
            label: 'YouTube or Vimeo link',
            placeholder: 'https://www.youtube.com/watch?v=…',
            submitLabel: 'Insert',
            validate: (value) => (parseVideoLink(value) ? undefined : 'Paste a link to one YouTube or Vimeo video.'),
        })
        if (!link) return
        if (!context.editor.insertBlock(['```' + VIDEO_FENCE, link, '```'].join('\n'), { focus: true })) {
            context.notify("The video couldn't go there. Put the caret on an empty line and try again.")
        }
    })

    context.commandMenu.register({
        id: INSERT_COMMAND,
        title: 'Video',
        detail: 'Insert a YouTube or Vimeo video',
        icon: 'video',
        group: 'Insert',
        // After Map (115): the blocks a person puts in a document.
        order: 116,
        keywords: ['youtube', 'vimeo', 'shorts', 'embed', 'film', 'clip', 'watch'],
        // No video plays in a Protected Document, so none is offered there.
        when: (menu) => menu.bodyWritable && !menu.inTable && !menu.protectedDocument,
        command: INSERT_COMMAND,
    })
}
