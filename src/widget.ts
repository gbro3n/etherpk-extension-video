/**
 * A video in a document: what the extension draws over each ```` ```video ```` fence.
 *
 * Nothing reaches YouTube or Vimeo until the person presses play. Before that the block is a card:
 * the video's picture and title when the Show video thumbnails setting is on (fetched once per
 * video and kept on the device), a plain card when it is off. Pressing play swaps the card for the
 * player, in a frame the Client builds (`context.embeds.frame`), and the keyboard moves
 * into it.
 *
 * Under the video, never over it (YouTube forbids anything drawn over its player), a caption links
 * to the video's own page, which still works when a player refuses to play (a Vimeo video limited to
 * its owner's sites, a video taken down). Where the document can be written, the caption also offers
 * the link as text and deleting the video. A delete is one editor change, so the notice it shows
 * says how to undo it rather than asking first.
 */
import type { FenceContext, FenceInfo, FenceWidget, MountedFence } from '@appsoftwareltd/etherpk-extension-api'

import { parseVideoLink, playAddress, providerName, type VideoLink } from './links'

/** What a card needs from the extension around it. */
export interface VideoServices {
    /** Whether the person lets the card fetch a picture and a title (the `thumbnails` setting). */
    thumbnails(): boolean
    /** Hear the person change the setting. Returns the way to stop. */
    subscribeSettings(listener: () => void): () => void
    /** The video's title and picture, fetched once and kept, or null when they cannot be had. */
    details(link: VideoLink): Promise<{ title?: string; thumbnail?: string } | null>
    /** A frame for the player, which the Client builds. */
    frame(options: { src: string; title: string }): HTMLIFrameElement
    /** Tell the person something the page does not show, such as how to undo a delete. */
    notify(message: string): void
}

/** The caption row under a video. */
const CAPTION_HEIGHT = 40
/** A block whose link is not a video: one line and a button. */
const MESSAGE_HEIGHT = 72
/** The widest a landscape video is drawn, and the size an upright Short is drawn at. */
const MAX_WIDTH = 720
const SHORT_WIDTH = 315
const SHORT_HEIGHT = 560

/**
 * The width of the document's column, as last measured by any video in it, so `height` can be
 * asked before a video is drawn. Every video in an editor shares the column.
 */
let column = 680
const mounted = new Set<FenceContext>()

/** The player's size for a video in a column this wide. */
export function playerSize(link: VideoLink, width: number): { width: number; height: number } {
    if (link.short) {
        const w = Math.min(SHORT_WIDTH, width)
        return { width: w, height: Math.round(Math.min(SHORT_HEIGHT, (w * 16) / 9)) }
    }
    const w = Math.min(MAX_WIDTH, width)
    return { width: w, height: Math.round((w * 9) / 16) }
}

function linkOf(info: Pick<FenceInfo, 'body'>): VideoLink | null {
    return parseVideoLink(info.body.find((line) => line.trim() !== '') ?? '')
}

/** The block's height: the player's and its caption's, or a message's. */
export function videoHeight(info: Pick<FenceInfo, 'body'>, width = column): number {
    const link = linkOf(info)
    return link ? playerSize(link, width).height + CAPTION_HEIGHT : MESSAGE_HEIGHT
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag)
    node.className = className
    if (text !== undefined) node.textContent = text
    return node
}

const PLAY_ICON = 'M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z'

function playIcon(): SVGSVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    svg.setAttribute('class', 'video-play-icon')
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', PLAY_ICON)
    svg.append(path)
    return svg
}

export function createVideoWidget(services: VideoServices): FenceWidget {
    return {
        height: (info) => videoHeight(info),
        mount(host, initial): MountedFence {
            let context = initial
            let link = linkOf(context)
            let playing = false
            /** Bumped by each draw, so details arriving for an earlier one are dropped. */
            let drawn = 0
            const root = element('figure', 'video')
            host.append(root)
            mounted.add(context)

            const draw = () => {
                const ticket = ++drawn
                playing = false
                root.replaceChildren()
                link = linkOf(context)
                root.dataset.provider = link?.provider ?? ''
                if (!link) {
                    root.classList.add('video--message')
                    const text = element('p', 'video-message', "This isn't a link to a YouTube or Vimeo video.")
                    const edit = element('button', 'video-button', 'Edit link')
                    edit.type = 'button'
                    edit.addEventListener('click', () => context.editAsText())
                    root.append(text, edit)
                    return
                }
                root.classList.remove('video--message')
                const video = link
                // As wide as the column allows, never wider: a fixed width would widen the editor's
                // lines on a narrow screen. The height follows from the shape.
                const frame = element('div', 'video-frame')
                frame.style.maxWidth = `${video.short ? SHORT_WIDTH : MAX_WIDTH}px`
                frame.style.aspectRatio = video.short ? '9 / 16' : '16 / 9'
                const name = providerName(video.provider)
                const poster = element('button', 'video-poster')
                poster.type = 'button'
                poster.setAttribute('aria-label', `Play the ${name} video`)
                poster.dataset.testid = 'video-play'
                const title = element('span', 'video-title', `${name} video`)
                poster.append(playIcon(), title)
                poster.addEventListener('click', () => play(video, name, title.textContent ?? `${name} video`))
                frame.append(poster)

                const caption = element('figcaption', 'video-caption')
                drawCaption(caption, video, name)
                root.append(frame, caption)

                if (services.thumbnails()) {
                    // A YouTube picture's address is known from the id; Vimeo's comes with its details.
                    if (video.provider === 'youtube') showThumbnail(poster, `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`)
                    void services.details(video).then((details) => {
                        if (ticket !== drawn || playing || !details) return
                        if (details.title) {
                            title.textContent = details.title
                            poster.setAttribute('aria-label', `Play "${details.title}" on ${name}`)
                        }
                        if (details.thumbnail && video.provider === 'vimeo') showThumbnail(poster, details.thumbnail)
                    })
                }
                if (context.takeFocus()) poster.focus()
            }

            /**
             * The row under the video: its own page, then, while the document can be written, the
             * link as text and deleting the video. Drawn again when that changes, without touching the
             * player above it.
             */
            let captionWritable = false
            const drawCaption = (caption: HTMLElement, video: VideoLink, name: string) => {
                captionWritable = context.writable
                const open = element('a', 'video-open', video.short ? `Open the Short on ${name}` : `Open on ${name}`)
                open.href = video.page
                open.target = '_blank'
                open.rel = 'noopener'
                caption.replaceChildren(open)
                if (!captionWritable) return
                const edit = element('button', 'video-action', 'Edit link')
                edit.type = 'button'
                edit.dataset.testid = 'video-edit-link'
                edit.addEventListener('click', () => context.editAsText())
                const remove = element('button', 'video-action', 'Delete')
                remove.type = 'button'
                remove.dataset.testid = 'video-delete'
                remove.setAttribute('aria-label', `Delete the ${name} video`)
                remove.addEventListener('click', () => {
                    if (context.remove()) services.notify('Video deleted. Press Ctrl+Z (Cmd+Z on a Mac) in the document to bring it back.')
                })
                caption.append(edit, remove)
            }

            const showThumbnail = (poster: HTMLElement, src: string) => {
                const image = element('img', 'video-thumbnail')
                image.alt = ''
                image.decoding = 'async'
                image.referrerPolicy = 'no-referrer'
                // A picture that will not load leaves the plain card, not a broken image.
                image.addEventListener('error', () => {
                    image.remove()
                    poster.classList.remove('video-poster--picture')
                })
                image.src = src
                poster.classList.add('video-poster--picture')
                poster.prepend(image)
            }

            const play = (video: VideoLink, name: string, label: string) => {
                const frame = root.querySelector<HTMLElement>('.video-frame')
                if (!frame) return
                playing = true
                const player = services.frame({ src: playAddress(video), title: label === `${name} video` ? `${name} video player` : `${label} (${name})` })
                player.className = 'video-player'
                frame.replaceChildren(player)
                player.focus()
            }

            // The column's width, for the block's height: a change tells the editor to ask every
            // video's height again. The card itself follows the width through CSS, so it is not drawn
            // again, which would take the keyboard's focus from it. The work waits for the next frame,
            // since telling the editor a height changed resizes the hosts this observes, which inside
            // the callback would be a loop the browser reports as an error.
            let frame = 0
            const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
                const width = Math.round(entries[0]?.contentRect.width ?? 0)
                if (width <= 0 || Math.abs(width - column) < 8) return
                cancelAnimationFrame(frame)
                frame = requestAnimationFrame(() => {
                    column = width
                    for (const other of mounted) other.resized()
                })
            })
            observer?.observe(host)
            const stopSettings = services.subscribeSettings(() => {
                if (!playing) draw()
            })

            draw()
            return {
                update(next) {
                    mounted.delete(context)
                    mounted.add(next)
                    const before = link
                    context = next
                    const after = linkOf(next)
                    // Only a change of video draws again: a playing video keeps playing through any other.
                    if (before?.embed !== after?.embed) {
                        draw()
                        return
                    }
                    const caption = root.querySelector<HTMLElement>('.video-caption')
                    if (after && caption && next.writable !== captionWritable) drawCaption(caption, after, providerName(after.provider))
                },
                destroy() {
                    mounted.delete(context)
                    cancelAnimationFrame(frame)
                    observer?.disconnect()
                    stopSettings()
                    root.remove()
                },
            }
        },
    }
}
