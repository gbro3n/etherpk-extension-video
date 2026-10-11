import { describe, expect, it } from 'vitest'

import { parseStart, parseVideoLink, playAddress } from './links'

const ID = 'abcDEF12_-3'

describe('YouTube links', () => {
    it.each([
        [`https://www.youtube.com/watch?v=${ID}`],
        [`https://youtube.com/watch?v=${ID}&list=PL123&index=2`],
        [`https://m.youtube.com/watch?v=${ID}`],
        [`https://music.youtube.com/watch?v=${ID}`],
        [`https://youtu.be/${ID}?si=share-token`],
        [`https://www.youtube.com/live/${ID}`],
        [`https://www.youtube.com/embed/${ID}`],
        [`https://www.youtube-nocookie.com/embed/${ID}`],
        [`https://www.youtube.com/v/${ID}`],
    ])('plays %s from the privacy-enhanced player', (link) => {
        const video = parseVideoLink(link)
        expect(video).toMatchObject({ provider: 'youtube', id: ID, short: false })
        expect(video?.embed).toBe(`https://www.youtube-nocookie.com/embed/${ID}`)
        expect(video?.page).toBe(`https://www.youtube.com/watch?v=${ID}`)
    })

    it('plays a Short upright, from its own page', () => {
        expect(parseVideoLink(`https://www.youtube.com/shorts/${ID}`)).toMatchObject({ short: true, page: `https://www.youtube.com/shorts/${ID}` })
    })

    it('starts where the link says, in seconds', () => {
        expect(parseVideoLink(`https://youtu.be/${ID}?t=90`)?.embed).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=90`)
        expect(parseVideoLink(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toMatchObject({ start: 90, page: `https://www.youtube.com/watch?v=${ID}&t=90s` })
    })

    it.each([
        ['a playlist', 'https://www.youtube.com/playlist?list=PL123'],
        ['a channel', 'https://www.youtube.com/@garden-channel'],
        ['a search', 'https://www.youtube.com/results?search_query=beans'],
        ['an id of the wrong length', 'https://youtu.be/short'],
        ['another site', `https://example.com/watch?v=${ID}`],
        ['text around a link', `Watch https://youtu.be/${ID}`],
    ])('does not play %s', (_what, link) => {
        expect(parseVideoLink(link)).toBeNull()
    })
})

describe('Vimeo links', () => {
    it.each([
        ['https://vimeo.com/76979871', '76979871', undefined],
        ['https://vimeo.com/76979871/a1b2c3d4e5', '76979871', 'a1b2c3d4e5'],
        ['https://vimeo.com/76979871?h=a1b2c3d4e5', '76979871', 'a1b2c3d4e5'],
        ['https://vimeo.com/channels/staffpicks/76979871', '76979871', undefined],
        ['https://vimeo.com/groups/gardeners/videos/76979871', '76979871', undefined],
        ['https://vimeo.com/showcase/12345/video/76979871', '76979871', undefined],
        ['https://player.vimeo.com/video/76979871?h=a1b2c3d4e5', '76979871', 'a1b2c3d4e5'],
    ])('plays %s', (link, id, hash) => {
        const video = parseVideoLink(link)
        expect(video).toMatchObject({ provider: 'vimeo', id, short: false })
        expect(video?.hash).toBe(hash)
        expect(video?.embed).toBe(`https://player.vimeo.com/video/${id}?${hash ? `h=${hash}&` : ''}dnt=1`)
    })

    it('starts where the link says', () => {
        expect(parseVideoLink('https://vimeo.com/76979871#t=1m2s')).toMatchObject({ start: 62, embed: 'https://player.vimeo.com/video/76979871?dnt=1#t=62s' })
    })

    it('does not play On Demand or a page that is not a video', () => {
        expect(parseVideoLink('https://vimeo.com/ondemand/garden/123')).toBeNull()
        expect(parseVideoLink('https://vimeo.com/gardener')).toBeNull()
    })
})

describe('start times', () => {
    it.each([
        ['90', 90],
        ['90s', 90],
        ['1m30s', 90],
        ['1h2m3s', 3723],
        ['1:30', 90],
        ['', undefined],
        ['soon', undefined],
        ['0', undefined],
    ])('reads %s as %s', (text, seconds) => {
        expect(parseStart(text)).toBe(seconds)
    })
})

describe('playing', () => {
    it('asks the player to start at once, keeping where it starts', () => {
        expect(playAddress(parseVideoLink(`https://youtu.be/${ID}?t=90`)!)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?start=90&autoplay=1`)
        expect(playAddress(parseVideoLink('https://vimeo.com/76979871#t=62')!)).toBe('https://player.vimeo.com/video/76979871?dnt=1&autoplay=1#t=62s')
    })
})
