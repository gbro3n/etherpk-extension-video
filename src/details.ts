/**
 * A video's title and picture, from the provider's oEmbed endpoint, fetched once per video and kept
 * on the device (`context.storage`), so a document shown again sends nothing. Asked only while the
 * Show video thumbnails setting is on, and when a site is published.
 */
import type { ExtensionStorage } from '@appsoftwareltd/etherpk-extension-api'

import type { VideoLink } from './links'

export interface VideoDetails {
    title?: string
    thumbnail?: string
}

/** How long details are kept before they are fetched again: a title can change. */
const KEEP_FOR = 30 * 24 * 60 * 60 * 1000

function endpoint(link: VideoLink): string {
    const page = encodeURIComponent(link.page)
    return link.provider === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${page}` : `https://vimeo.com/api/oembed.json?url=${page}`
}

/** An https address as given, or undefined for anything else. */
function https(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    try {
        return new URL(value).protocol === 'https:' ? value : undefined
    } catch {
        return undefined
    }
}

export function createDetails(storage: ExtensionStorage, fetcher: typeof fetch = (...args) => fetch(...args)): (link: VideoLink) => Promise<VideoDetails | null> {
    const pending = new Map<string, Promise<VideoDetails | null>>()
    return (link) => {
        const key = `details:${link.provider}:${link.id}`
        const kept = storage.get<VideoDetails & { at: number }>(key)
        if (kept && Date.now() - kept.at < KEEP_FOR) return Promise.resolve({ title: kept.title, thumbnail: kept.thumbnail })
        let request = pending.get(key)
        if (!request) {
            request = fetcher(endpoint(link), { credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' })
                .then((response) => (response.ok ? response.json() : null))
                .then((json: unknown) => {
                    if (!json || typeof json !== 'object') return null
                    const record = json as Record<string, unknown>
                    const details: VideoDetails = {
                        ...(typeof record.title === 'string' && record.title.trim() !== '' ? { title: record.title.trim() } : {}),
                        ...(https(record.thumbnail_url) ? { thumbnail: https(record.thumbnail_url) } : {}),
                    }
                    storage.set(key, { ...details, at: Date.now() })
                    return details
                })
                .catch(() => null)
                .finally(() => pending.delete(key))
            pending.set(key, request)
        }
        return request
    }
}
