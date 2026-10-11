/**
 * Which links are videos this extension plays, and where each one plays from.
 *
 * - **YouTube**: one video, from `watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/` or `/v/`,
 *   on `www.`, `m.` or `music.youtube.com` or `youtube-nocookie.com`. A playlist, a channel or a
 *   search is not a video, and stays an ordinary link.
 * - **Vimeo**: one video by its number, with the hash an unlisted video needs (`/ID/HASH` or
 *   `?h=HASH`), from `vimeo.com/ID`, `/channels/NAME/ID`, `/groups/NAME/videos/ID`,
 *   `/showcase/ID/video/ID`, `/album/ID/video/ID` or `player.vimeo.com/video/ID`. On Demand is not.
 *
 * A start time (`t=90`, `t=1m30s`, `start=90`, Vimeo's `#t=1m2s`) starts the player there. The link
 * itself is kept exactly as it was pasted: this module only reads it.
 *
 * YouTube plays from `youtube-nocookie.com`, which sets no cookies, and Vimeo with `dnt=1`, which
 * keeps the player from tracking the session. Pure, so it is tested in Node.
 */

export type Provider = 'youtube' | 'vimeo'

export interface VideoLink {
    provider: Provider
    /** YouTube's 11-character id, or Vimeo's number. */
    id: string
    /** The hash of an unlisted Vimeo video. */
    hash?: string
    /** Where the player starts, in whole seconds. */
    start?: number
    /** A YouTube Short, which plays upright (9:16). */
    short: boolean
    /** The address the player is framed from. */
    embed: string
    /** The video's own page, for "Open on YouTube" and a published site's link. */
    page: string
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'])
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const VIMEO_ID = /^\d{1,12}$/
const VIMEO_HASH = /^[0-9a-f]{6,20}$/i

/** `90`, `90s`, `1m30s`, `1h2m3s` or `1:30` as whole seconds, or undefined. */
export function parseStart(value: string | null | undefined): number | undefined {
    if (!value) return undefined
    const text = value.trim().toLowerCase()
    if (/^\d+$/.test(text)) return Number(text) || undefined
    const clock = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(text)
    if (clock) return Number(clock[1] ?? 0) * 3600 + Number(clock[2]) * 60 + Number(clock[3]) || undefined
    const parts = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text)
    if (!parts || text === '') return undefined
    const seconds = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0)
    return seconds || undefined
}

function youtube(url: URL): VideoLink | null {
    const segments = url.pathname.split('/').filter(Boolean)
    let id: string | undefined
    let short = false
    if (url.hostname === 'youtu.be') id = segments[0]
    else if (segments[0] === 'watch') id = url.searchParams.get('v') ?? undefined
    else if (['shorts', 'live', 'embed', 'v', 'e'].includes(segments[0] ?? '')) {
        id = segments[1]
        short = segments[0] === 'shorts'
    }
    if (!id || !YOUTUBE_ID.test(id)) return null
    const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start') ?? new URLSearchParams(url.hash.slice(1)).get('t'))
    const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`)
    if (start) embed.searchParams.set('start', String(start))
    const page = short ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`
    return { provider: 'youtube', id, ...(start ? { start } : {}), short, embed: embed.href, page }
}

function vimeo(url: URL): VideoLink | null {
    const segments = url.pathname.split('/').filter(Boolean)
    let id: string | undefined
    let hash: string | undefined = url.searchParams.get('h') ?? undefined
    if (url.hostname === 'player.vimeo.com') {
        if (segments[0] === 'video') id = segments[1]
    } else if (segments[0] === 'channels' || segments[0] === 'ondemand') {
        if (segments[0] === 'channels') id = segments[2]
    } else if (segments[0] === 'groups' && segments[2] === 'videos') id = segments[3]
    else if ((segments[0] === 'showcase' || segments[0] === 'album') && segments[2] === 'video') id = segments[3]
    else {
        id = segments[0]
        if (segments[1] && VIMEO_HASH.test(segments[1])) hash ??= segments[1]
    }
    if (!id || !VIMEO_ID.test(id)) return null
    if (hash && !VIMEO_HASH.test(hash)) hash = undefined
    const start = parseStart(new URLSearchParams(url.hash.slice(1)).get('t'))
    const embed = new URL(`https://player.vimeo.com/video/${id}`)
    if (hash) embed.searchParams.set('h', hash)
    embed.searchParams.set('dnt', '1')
    if (start) embed.hash = `t=${start}s`
    const page = `https://vimeo.com/${id}${hash ? `/${hash}` : ''}${start ? `#t=${start}s` : ''}`
    return { provider: 'vimeo', id, ...(hash ? { hash } : {}), ...(start ? { start } : {}), short: false, embed: embed.href, page }
}

/** The video a link names, or null when it is not one this extension plays. */
export function parseVideoLink(text: string): VideoLink | null {
    const trimmed = text.trim()
    if (trimmed === '' || /\s/.test(trimmed)) return null
    let url: URL
    try {
        url = new URL(trimmed)
    } catch {
        return null
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    const host = url.hostname.toLowerCase()
    if (host === 'youtu.be' || YOUTUBE_HOSTS.has(host)) return youtube(url)
    if (VIMEO_HOSTS.has(host)) return vimeo(url)
    return null
}

/** The address the player loads when the person presses play: the embed, told to play at once. */
export function playAddress(link: VideoLink): string {
    const url = new URL(link.embed)
    url.searchParams.set('autoplay', '1')
    return url.href
}

/** The provider's name, as the card and the links say it. */
export function providerName(provider: Provider): string {
    return provider === 'youtube' ? 'YouTube' : 'Vimeo'
}
