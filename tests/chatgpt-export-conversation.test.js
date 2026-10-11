const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const script = fs.readFileSync(path.join(__dirname, '..', 'chatgpt-export-conversation.js'), 'utf8');
const chrome = process.env.CHROME_BIN || (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');

test('full export follows older-message cursors instead of returning the loaded chunk', () => {
    return runInBrowser('<div data-user-message-bubble="true">Recent question</div><div data-markdown-text-style="assistant-message">Recent answer</div>', async state => {
        const message = (id, role, text) => ({ id, author: { role }, content: { content_type: 'text', parts: [text] } });
        state.apiPages.initial = {
            title: 'Full fixture', messages: [message('m3', 'user', 'Recent question'), message('m4', 'assistant', 'Recent answer')],
            page_info: { has_previous_page: true, start_cursor: 'older' }
        };
        state.apiPages.older = {
            messages: [message('m1', 'user', 'First question'), message('m2', 'assistant', 'First answer')],
            page_info: { has_previous_page: false, start_cursor: null }
        };
        await state.pageWindow.fetch('/backend-api/conversations/11111111-1111-4111-8111-111111111111?num_turns=10', {
            headers: { Authorization: 'Bearer synthetic-test-token', 'ChatGPT-Account-Id': 'fixture-account' }
        });
        await state.menus['Copy conversation JSON']();
        if (!state.clipboard) throw new Error('Full conversation was not exported');
        const data = JSON.parse(state.clipboard);
        if (data.messageCount !== 4) throw new Error('Export returned only the loaded chunk instead of all four messages');
        if (data.messages.map(message => message.text).join('|') !== 'First question|First answer|Recent question|Recent answer') {
            throw new Error('Full conversation order was not preserved');
        }
        const older = state.requests.find(request => new URL(request.url).searchParams.get('before') === 'older');
        if (!older || !new URL(older.url).pathname.endsWith('/conversations/11111111-1111-4111-8111-111111111111/messages')) {
            throw new Error('Export did not use the captured older-messages endpoint');
        }
        if (older.headers.get('ChatGPT-Account-Id') !== 'fixture-account' || !older.headers.get('Authorization')) {
            throw new Error('Export lost the active request identity');
        }
    });
});

// Use a real DOM and innerText, without accessing an account or browser profile.
// Temporary fixtures/profiles are retained; TMPDIR controls their location.
function runInBrowser(markup, check) {
    const scratch = process.env.TMPDIR || path.join(os.homedir(), '.hermes', 'cache', 'scratch');
    const dir = fs.mkdtempSync(path.join(scratch, 'chatgpt-export-test-'));
    const fixture = path.join(dir, 'fixture.html');
    const embedded = JSON.stringify({ script, markup, check: check.toString() }).replace(/</g, '\\u003c');
    fs.writeFileSync(fixture, `<!doctype html><meta charset="utf-8">
<title>Fixture conversation - ChatGPT</title><div id="fixture"></div><pre id="result"></pre>
<script>
const input = ${embedded};
const parsed = new DOMParser().parseFromString(input.markup, 'text/html');
// Optional private snapshots are inert: no scripts, requests, or event handlers.
parsed.querySelectorAll('script, style, link, meta, iframe, object, embed, img, video, audio, source').forEach(node => node.remove());
for (const node of parsed.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
        if (attr.name.startsWith('on') || ['src', 'srcset', 'style'].includes(attr.name)) node.removeAttribute(attr.name);
    }
}
document.getElementById('fixture').replaceChildren(...parsed.body.childNodes);
const state = { menus: {}, alerts: [], clipboard: null, downloads: [], errors: [], requests: [], apiPages: {} };
const pageWindow = {
    location: { href: 'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111' },
    alert: message => state.alerts.push(message),
    open: () => {
        state.previewOpenAt = state.requests.length;
        state.preview = { document: document.implementation.createHTMLDocument(''), close() { state.previewClosed = true; } };
        return state.preview;
    },
    fetch: async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, 'https://chatgpt.com');
        state.requests.push({ url: url.href, options, headers: new Headers(options.headers || input.headers) });
        if (state.onRequest) await state.onRequest(url, options);
        const page = state.apiPages[url.searchParams.get('before') || 'initial'];
        const status = typeof page === 'number' ? page : page ? 200 : 401;
        return { ok: status === 200, status, json: async () => page };
    }
};
state.pageWindow = pageWindow;
state.message = (id, role, text) => ({ id, author: { role }, content: { content_type: 'text', parts: [text] } });
state.page = (messages, previous = false, cursor = null) => ({
    title: 'Full fixture', messages,
    page_info: { has_previous_page: previous, has_next_page: false, start_cursor: cursor, end_cursor: null }
});
state.prepare = async pages => {
    state.apiPages = pages;
    await pageWindow.fetch(new Request('https://chatgpt.com/backend-api/conversations/11111111-1111-4111-8111-111111111111?num_turns=10', {
        headers: { Authorization: 'Bearer synthetic-test-token', 'ChatGPT-Account-Id': 'fixture-account', 'chatgpt-project-id': 'fixture-project' }
    }));
};
state.blobParts = [];
const ExportBlob = class extends Blob {
    constructor(parts, options) { super(parts, options); state.blobParts.push(parts); }
};
const run = new Function('document', 'window', 'GM_registerMenuCommand',
    'GM_setClipboard', 'GM_download', 'console', 'Blob', input.script);
(async () => {
try {
    run(document, pageWindow, (label, callback) => { state.menus[label] = callback; },
        value => { state.clipboard = value; }, value => state.downloads.push(value),
        { error: () => state.errors.push('export error') }, ExportBlob);
    await new Function('state', 'document', 'return (' + input.check + ')(state, document)')(state, document);
    document.getElementById('result').textContent = btoa(JSON.stringify({ ok: true }));
} catch (error) {
    document.getElementById('result').textContent = btoa(JSON.stringify({ ok: false, error: error.message }));
}
})();
</script>`, { flag: 'wx' });
    return new Promise((resolve, reject) => {
        const child = spawn(chrome, [
            '--headless', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--disable-component-update',
            '--disable-sync', '--disable-extensions',
            '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${path.join(dir, 'profile')}`,
            '--dump-dom', '--virtual-time-budget=1000', pathToFileURL(fixture).href
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        let done = false;
        const finish = error => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            // Stop only this test's isolated browser, never the user's browser.
            child.kill();
            child.stdout.destroy();
            child.unref();
            if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => finish(new Error('Browser did not return a result')), 15000);
        child.on('error', finish);
        child.on('exit', () => {
            if (!done) finish(new Error('Browser exited without a test result'));
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
            output += chunk;
            const match = output.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/);
            if (!match) return;
            try {
                const outcome = JSON.parse(Buffer.from(match[1], 'base64').toString());
                assert.equal(outcome.ok, true, outcome.error);
                finish();
            } catch (error) { finish(error); }
        });
    });
}

test('overlapping API pages export each message once using its newest content', () => {
    return runInBrowser('', async state => {
        await state.prepare({
            initial: state.page([state.message('m2', 'assistant', 'Updated answer'), state.message('m3', 'user', 'Latest question')], true, 'older'),
            older: state.page([state.message('m1', 'user', 'First question'), state.message('m2', 'assistant', 'Old answer')])
        });
        await state.menus['Copy conversation JSON']();
        const data = JSON.parse(state.clipboard);
        if (!data.complete || data.pageCount !== 2 || data.messageCount !== 3 || data.messages[1].text !== 'Updated answer') {
            throw new Error('Overlapping pages were duplicated or retained stale content');
        }
        if (data.messages.map(message => message.id).join(',') !== 'm1,m2,m3') throw new Error('Chronological order changed');
    });
});

test('cursor loops, missing cursors, malformed pages, and HTTP failures never publish partial exports', () => {
    return runInBrowser('', async state => {
        const latest = state.message('m2', 'assistant', 'Latest answer');
        const cases = [
            { initial: state.page([latest], true, 'older'), older: state.page([], true, 'older') },
            { initial: state.page([latest], true, null) },
            { initial: state.page([latest], true, 'older'), older: 429 },
            { initial: state.page([latest], true, 'older'), older: { messages: [] } },
            { initial: state.page([{ author: { role: 'user' } }]) }
        ];
        for (const pages of cases) {
            await state.prepare(pages);
            const errors = state.errors.length;
            await state.menus['Copy conversation JSON']();
            if (state.clipboard !== null || state.errors.length !== errors + 1) {
                throw new Error('Incomplete or malformed history was exported as complete');
            }
        }
    });
});

test('saved-page exports require captured same-origin authentication and preserve structured content', () => {
    return runInBrowser('<div data-user-message-bubble="true">Only loaded content</div>', async state => {
        await state.menus['Copy conversation JSON']();
        if (state.clipboard !== null || state.requests.length || !state.alerts.at(-1).includes('Reload')) {
            throw new Error('Exporter silently fell back to rendered content or guessed authentication');
        }
        await state.pageWindow.fetch('https://example.org/backend-api/conversations/11111111-1111-4111-8111-111111111111', {
            headers: { Authorization: 'Bearer other-origin-fixture-token' }
        });
        await state.menus['Copy conversation JSON']();
        if (state.clipboard !== null) throw new Error('Cross-origin request was accepted as conversation credentials');
        const image = { content_type: 'image_asset_pointer', asset_pointer: 'fixture-image' };
        const message = state.message('m1', 'user', 'Question with image');
        message.content.parts.push(image);
        await state.prepare({ initial: state.page([message]) });
        await state.menus['Copy conversation JSON']();
        const data = JSON.parse(state.clipboard);
        if (data.messages[0].raw.content.parts[1].asset_pointer !== 'fixture-image' || data.messages[0].text !== 'Question with image') {
            throw new Error('Structured message content was lost');
        }
        const request = state.requests.at(-1);
        if (request.headers.get('chatgpt-project-id') !== 'fixture-project' || request.options.credentials !== 'include' ||
            request.options.method !== 'GET' || request.options.mode !== 'same-origin' || request.options.redirect !== 'error') {
            throw new Error('Read-only account/project request boundary changed');
        }
        state.pageWindow.location.href = 'https://chatgpt.com/';
        state.clipboard = null;
        const count = state.requests.length;
        await state.menus['Copy conversation JSON']();
        if (state.clipboard !== null || state.requests.length !== count || !state.alerts.at(-1).includes('saved conversation')) {
            throw new Error('Unsaved conversation made an unauthorized history request');
        }
    });
});

test('navigation and account changes during pagination abort without copying partial history', () => {
    return runInBrowser('', async state => {
        for (const change of ['navigation', 'account']) {
            state.pageWindow.location.href = 'https://chatgpt.com/c/11111111-1111-4111-8111-111111111111';
            await state.prepare({ initial: state.page([state.message('m1', 'user', 'Latest')], true, 'older'), older: state.page([]) });
            state.onRequest = async url => {
                if (!url.searchParams.has('before')) return;
                state.onRequest = null;
                if (change === 'navigation') {
                    state.pageWindow.location.href = 'https://chatgpt.com/c/22222222-2222-4222-8222-222222222222';
                } else {
                    await state.pageWindow.fetch('/backend-api/conversations/11111111-1111-4111-8111-111111111111', {
                        headers: { Authorization: 'Bearer switched-test-token', 'ChatGPT-Account-Id': 'different-fixture-account' }
                    });
                }
            };
            await state.menus['Copy conversation JSON']();
            if (state.clipboard !== null || !state.alerts.at(-1).includes('changed during export')) {
                throw new Error('Identity change did not abort the export');
            }
        }
    });
});

test('all menu actions use full history and preview opens before asynchronous loading', () => {
    return runInBrowser('', async state => {
        await state.prepare({
            initial: state.page([state.message('m2', 'assistant', 'Latest')], true, 'older'),
            older: state.page([state.message('m1', 'user', '<script>fixture text only</script>')])
        });
        await state.menus['Show conversation stats']();
        if (!state.alerts.at(-1).includes('Messages: 2')) throw new Error('Stats counted only the loaded page');
        const requests = state.requests.length;
        await state.menus['Preview conversation JSON']();
        if (state.previewOpenAt !== requests || state.preview.opener !== null || state.previewClosed) {
            throw new Error('Preview did not open synchronously with a detached opener');
        }
        const preview = JSON.parse(state.preview.document.body.textContent);
        if (preview.messageCount !== 2 || state.preview.document.querySelector('script')) {
            throw new Error('Preview lost older messages or interpreted message text as HTML');
        }
        await state.menus['Download conversation JSON']();
        const download = state.downloads[0];
        if (!download || !download.url.startsWith('blob:') || !download.saveAs || !download.name.endsWith('.json')) {
            throw new Error('Download did not produce its JSON blob');
        }
        const data = JSON.parse(state.blobParts[0][0]);
        if (data.messageCount !== 2 || !data.complete) throw new Error('Download blob contained incomplete history');
        download.onload();
        if (state.errors.length) throw new Error('A full-history menu action failed');
    });
});
