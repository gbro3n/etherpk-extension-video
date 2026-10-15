import { expect, type Page, test } from '@playwright/test'

/**
 * Videos in a running EtherPK Client, over its editor harness (`/dev/editor`), which starts every
 * extension a graph would. Nothing here reaches YouTube or Vimeo: their addresses are answered by
 * the test (`answerProviders`), so a test sees what the extension asked for and when.
 */

const ID = 'abcDEF12_-3'
const WATCH = `https://www.youtube.com/watch?v=${ID}`
const SHORT = `https://www.youtube.com/shorts/${ID}`
const VIMEO = 'https://vimeo.com/76979871'
const video = (link: string) => ['```video', link, '```'].join('\n')

// A 1 by 1 pixel PNG, for every thumbnail.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

/** What the page asked of the providers, by address. */
async function answerProviders(page: Page): Promise<string[]> {
    const asked: string[] = []
    await page.route('https://www.youtube.com/oembed**', (route) => {
        asked.push(route.request().url())
        return route.fulfill({ json: { title: 'A walk round the garden', thumbnail_url: `https://i.ytimg.com/vi/${ID}/hqdefault.jpg` } })
    })
    await page.route('https://vimeo.com/api/oembed.json**', (route) => {
        asked.push(route.request().url())
        return route.fulfill({ json: { title: 'Planting beans', thumbnail_url: 'https://i.vimeocdn.com/video/1-d_640' } })
    })
    await page.route(/^https:\/\/(i\.ytimg\.com|i\.vimeocdn\.com)\//, (route) => {
        asked.push(route.request().url())
        return route.fulfill({ body: PIXEL, contentType: 'image/png' })
    })
    await page.route(/^https:\/\/(www\.youtube-nocookie\.com|player\.vimeo\.com)\//, (route) => {
        asked.push(route.request().url())
        return route.fulfill({ body: '<!doctype html><title>Player</title><p>Playing</p>', contentType: 'text/html' })
    })
    return asked
}

async function openEditor(page: Page) {
    await page.goto('/dev/editor')
    await expect(page.getByTestId('document-editor').locator('.cm-editor')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('editor-index-ready')).toBeVisible({ timeout: 30_000 })
}

async function setDoc(page: Page, text: string) {
    await page.evaluate((value) => (window as unknown as { __setDoc(text: string): void }).__setDoc(value), text)
    await expect.poll(() => getDoc(page)).toBe(text)
}

function getDoc(page: Page): Promise<string> {
    return page.evaluate(() => (window as unknown as { __getDoc(): string }).__getDoc())
}

async function caretAt(page: Page, position: number) {
    await page.getByTestId('document-editor').locator('.cm-content').click()
    await page.evaluate((at) => (window as unknown as { __setCaret(at: number): void }).__setCaret(at), position)
}

async function paste(page: Page, text: string) {
    await page.getByTestId('document-editor').locator('.cm-content').evaluate((element, value) => {
        const data = new DataTransfer()
        data.setData('text/plain', value)
        element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    }, text)
}

test.describe('a video in a document', () => {
    let asked: string[]

    test.beforeEach(async ({ page }) => {
        asked = await answerProviders(page)
        await openEditor(page)
    })

    test('a YouTube link pasted on an empty line becomes a video, and Mod+Z gives back the link', async ({ page }) => {
        await setDoc(page, 'Garden\n\nAfter')
        await caretAt(page, 'Garden\n'.length)
        await paste(page, WATCH)
        await expect.poll(() => getDoc(page)).toBe(['Garden', video(WATCH), 'After'].join('\n'))
        await expect(page.getByTestId('video-play')).toBeVisible()

        await page.keyboard.press('Control+z')
        await expect.poll(() => getDoc(page)).toBe(`Garden\n${WATCH}\nAfter`)
        await expect(page.getByTestId('video-play')).toHaveCount(0)
    })

    test("is a card with the video's title and picture, which plays only when pressed", async ({ page }) => {
        await setDoc(page, ['Garden', video(WATCH), 'After'].join('\n'))
        const play = page.getByTestId('video-play')
        await expect(play).toHaveAccessibleName('Play "A walk round the garden" on YouTube')
        await expect(page.getByRole('link', { name: 'Open on YouTube' })).toHaveAttribute('href', WATCH)
        expect(asked.some((url) => url.startsWith('https://www.youtube-nocookie.com/'))).toBe(false)

        await play.click()
        const player = page.locator('iframe.video-player')
        await expect(player).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1`)
        await expect(player).toHaveAttribute('title', 'A walk round the garden (YouTube)')
        await expect.poll(() => asked.some((url) => url.startsWith(`https://www.youtube-nocookie.com/embed/${ID}`))).toBe(true)
        // The caption stays under the player.
        await expect(page.getByRole('link', { name: 'Open on YouTube' })).toBeVisible()
    })

    test('a Vimeo video plays from player.vimeo.com', async ({ page }) => {
        await setDoc(page, ['Garden', video(VIMEO), 'After'].join('\n'))
        await expect(page.getByTestId('video-play')).toHaveAccessibleName('Play "Planting beans" on Vimeo')
        await page.getByTestId('video-play').click()
        await expect(page.locator('iframe.video-player')).toHaveAttribute('src', /^https:\/\/player\.vimeo\.com\/video\/76979871\?/)
    })

    test('a Short is drawn upright', async ({ page }) => {
        await setDoc(page, ['Garden', video(SHORT), 'After'].join('\n'))
        await expect(page.getByRole('link', { name: 'Open the Short on YouTube' })).toHaveAttribute('href', SHORT)
        // Measured once it has settled: the editor sizes the block again when it learns the column's width.
        await expect
            .poll(async () => {
                const box = await page.getByTestId('video-play').boundingBox()
                return box ? box.height / box.width : 0
            })
            .toBeGreaterThan(1.5)
    })

    test('a block whose link is not a video says so, and Edit link shows its text', async ({ page }) => {
        await setDoc(page, ['Garden', video('https://example.com/garden'), 'After'].join('\n'))
        await expect(page.getByText("This isn't a link to a YouTube or Vimeo video.")).toBeVisible()
        await page.getByRole('button', { name: 'Edit link' }).click()
        await expect(page.locator('.cm-line', { hasText: 'https://example.com/garden' })).toBeVisible()
    })

    test('the caption sits close under the video: its page, Edit link and Delete in one row', async ({ page }) => {
        await setDoc(page, ['Garden', video(WATCH), 'After'].join('\n'))
        const open = page.getByRole('link', { name: 'Open on YouTube' })
        const edit = page.getByTestId('video-edit-link')
        const remove = page.getByTestId('video-delete')
        await expect(remove).toBeVisible()
        // One row, left to right, each a short step from the last. Measured once it has settled: a card
        // is sized again when it learns the column's width.
        await expect
            .poll(async () => {
                const [a, b, c] = await Promise.all([open.boundingBox(), edit.boundingBox(), remove.boundingBox()])
                if (!a || !b || !c) return 'not drawn'
                const middle = (box: { y: number; height: number }) => box.y + box.height / 2
                return Math.abs(middle(a) - middle(b)) < 4 && Math.abs(middle(b) - middle(c)) < 4 && b.x - (a.x + a.width) < 24 && c.x - (b.x + b.width) < 24 && b.x > a.x && c.x > b.x
            })
            .toBe(true)
    })

    test('Edit link shows the link as text in the editor', async ({ page }) => {
        await setDoc(page, ['Garden', video(WATCH), 'After'].join('\n'))
        await page.getByTestId('video-edit-link').click()
        await expect(page.locator('.cm-line', { hasText: WATCH })).toBeVisible()
        await expect(page.getByTestId('video-play')).toHaveCount(0)
    })

    test('Delete removes the video at once, says how to undo it, and Mod+Z brings it back', async ({ page }) => {
        // The harness writes the Client's notices to the console rather than drawing them.
        const notices: string[] = []
        page.on('console', (message) => notices.push(message.text()))
        await setDoc(page, ['Garden', video(WATCH), 'After'].join('\n'))
        await page.getByTestId('video-delete').click()
        await expect.poll(() => getDoc(page)).toBe('Garden\nAfter')
        await expect.poll(() => notices).toContain('Video deleted. Press Ctrl+Z (Cmd+Z on a Mac) in the document to bring it back.')

        await page.getByTestId('document-editor').locator('.cm-content').focus()
        await page.keyboard.press('Control+z')
        await expect.poll(() => getDoc(page)).toBe(['Garden', video(WATCH), 'After'].join('\n'))
        await expect(page.getByTestId('video-play')).toBeVisible()
    })

    test('/video asks for a link, says when it is not a video, and puts the video at the caret', async ({ page }) => {
        await setDoc(page, 'Garden\n\nAfter')
        await caretAt(page, 'Garden\n'.length)
        await page.keyboard.type('/video')
        await expect(page.getByRole('option', { name: /^Video/ })).toHaveAttribute('aria-selected', 'true')
        await page.keyboard.press('Enter')

        const field = page.getByRole('textbox', { name: 'YouTube or Vimeo link' })
        await expect(field).toBeFocused()
        await field.fill('https://example.com/garden')
        await page.keyboard.press('Enter')
        await expect(page.getByText('Paste a link to one YouTube or Vimeo video.')).toBeVisible()
        await field.fill(VIMEO)
        await page.keyboard.press('Enter')

        await expect.poll(() => getDoc(page)).toBe(['Garden', video(VIMEO), 'After'].join('\n'))
        await expect(page.getByTestId('video-play')).toBeFocused()
    })
})

test('on a narrow screen a video is as wide as the column, never wider, and /video is offered', async ({ page }) => {
    await answerProviders(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await openEditor(page)
    await setDoc(page, ['Garden', video(WATCH), '', 'After'].join('\n'))
    await expect(page.getByTestId('video-play')).toBeVisible()
    // The harness page is wider than a phone (it is a desktop tool), so the card is measured against
    // the editor's column rather than the screen.
    const column = (await page.getByTestId('document-editor').locator('.cm-content').boundingBox())!
    const card = (await page.getByTestId('video-play').boundingBox())!
    expect(card.x + card.width).toBeLessThanOrEqual(column.x + column.width)
    expect(card.width).toBeGreaterThan(column.width * 0.8)

    await caretAt(page, ['Garden', video(WATCH), ''].join('\n').length)
    await page.keyboard.type('/video')
    await expect(page.getByRole('option', { name: /^Video/ })).toBeVisible()
})

/** A graph in the browser's private storage, opened at `concept`. */
async function openGraph(page: Page, id: string, pages: Record<string, string>, concept: string) {
    await page.goto('/dev/filesystem')
    await page.evaluate(
        async ({ id, pages }) => {
            const root = await navigator.storage.getDirectory()
            await root.removeEntry(`graph-${id}`, { recursive: true }).catch(() => {})
            const graph = await root.getDirectoryHandle(`graph-${id}`, { create: true })
            for (const sub of ['journals', 'pages', 'assets', 'etherpk']) await graph.getDirectoryHandle(sub, { create: true })
            const folder = await graph.getDirectoryHandle('pages')
            for (const [name, text] of Object.entries(pages)) {
                const writable = await (await folder.getFileHandle(`${name}.md`, { create: true })).createWritable()
                await writable.write(text)
                await writable.close()
            }
        },
        { id, pages },
    )
    await openDocument(page, id, concept)
}

async function openDocument(page: Page, id: string, concept: string) {
    await page.goto(`/g/${id}/d/${encodeURIComponent(concept)}?fs=opfs&autosaveMs=150`)
    await expect(page.locator(`[data-doc-target="${concept}"] .cm-content`)).toBeVisible({ timeout: 30_000 })
}

test.describe("a video in a document's backlinks", () => {
    // A video under a bullet that names Kitchen, so Kitchen's backlinks quote it.
    const PAGES = { Kitchen: 'The kitchen garden.\n', Walks: ['- [[Kitchen]] the walk we filmed', '  ```video', `  ${WATCH}`, '  ```', ''].join('\n'), Notes: 'Nothing here.\n' }

    test("is a link to the video's page with its title and picture, opening in a new tab", async ({ page }) => {
        await answerProviders(page)
        await openGraph(page, 'video-backlinks', PAGES, 'Kitchen')
        const backlinks = page.locator('[data-doc-target="Kitchen"]').getByTestId('document-backlinks')
        const link = backlinks.getByTestId('reference-fence-link')
        await expect(link).toBeVisible({ timeout: 30_000 })
        await expect(link).toHaveText('A walk round the garden (YouTube)')
        await expect(link).toHaveAttribute('href', WATCH)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link.getByRole('img', { name: 'A walk round the garden' })).toHaveAttribute('src', `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`)
        await expect(backlinks.getByTestId('reference-code')).toHaveCount(0)
    })

    test('turning Show video thumbnails off takes the picture and title away from backlinks already showing', async ({ page }) => {
        await answerProviders(page)
        await openGraph(page, 'video-backlinks-live', PAGES, 'Kitchen')
        const link = page.locator('[data-doc-target="Kitchen"]').getByTestId('document-backlinks').getByTestId('reference-fence-link')
        await expect(link.getByRole('img')).toBeVisible({ timeout: 30_000 })
        await page.getByTestId('ws-graph-settings').click()
        await page.getByTestId('settings-area-extensions').click()
        const row = page.locator('[data-testid="extension-row"][data-extension="video"]')
        await row.getByTestId('extension-settings').locator('summary').click()
        await row.locator('[data-testid="extension-setting"][data-setting="thumbnails"]').getByTestId('extension-setting-switch').uncheck()
        await page.keyboard.press('Escape')
        await expect(link).toHaveText('Watch on YouTube', { timeout: 10_000 })
        await expect(link.getByRole('img')).toHaveCount(0)
    })

    test('with Show video thumbnails off, is the link alone, and asks nothing of YouTube', async ({ page }) => {
        const asked = await answerProviders(page)
        await openGraph(page, 'video-backlinks-plain', PAGES, 'Notes')
        await page.getByTestId('ws-graph-settings').click()
        await page.getByTestId('settings-area-extensions').click()
        const row = page.locator('[data-testid="extension-row"][data-extension="video"]')
        await row.getByTestId('extension-settings').locator('summary').click()
        const thumbnails = row.locator('[data-testid="extension-setting"][data-setting="thumbnails"]').getByTestId('extension-setting-switch')
        await thumbnails.uncheck()
        await expect(thumbnails).not.toBeChecked()

        await openDocument(page, 'video-backlinks-plain', 'Kitchen')
        const link = page.locator('[data-doc-target="Kitchen"]').getByTestId('document-backlinks').getByTestId('reference-fence-link')
        await expect(link).toBeVisible({ timeout: 30_000 })
        await expect(link).toHaveText('Watch on YouTube')
        await expect(link).toHaveAttribute('href', WATCH)
        await expect(link.getByRole('img')).toHaveCount(0)
        expect(asked).toEqual([])
    })
})
