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

// Use a real DOM and innerText, without accessing an account or browser profile.
// Temporary fixtures/profiles are retained; TMPDIR controls their location.
function runInBrowser(markup, check) {
    const scratch = process.env.TMPDIR || path.join(os.homedir(), '.hermes', 'cache', 'scratch');
    const dir = fs.mkdtempSync(path.join(scratch, 'chatgpt-export-test-'));
    const fixture = path.join(dir, 'fixture.html');
    const embedded = JSON.stringify({ script, markup }).replace(/</g, '\\u003c');
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
const state = { menus: {}, alerts: [], clipboard: null, downloads: [], errors: [] };
const pageWindow = {
    location: { href: 'https://chatgpt.com/c/fixture' },
    alert: message => state.alerts.push(message),
    open: () => ({ addEventListener() {} })
};
const run = new Function('document', 'window', 'GM_registerMenuCommand',
    'GM_setClipboard', 'GM_download', 'console', input.script);
try {
    run(document, pageWindow, (label, callback) => { state.menus[label] = callback; },
        value => { state.clipboard = value; }, value => state.downloads.push(value),
        { error: () => state.errors.push('export error') });
    (${check.toString()})(state, document);
    document.getElementById('result').textContent = btoa(JSON.stringify({ ok: true }));
} catch (error) {
    document.getElementById('result').textContent = btoa(JSON.stringify({ ok: false, error: error.message }));
}
</script>`, { flag: 'wx' });
    return new Promise((resolve, reject) => {
        const child = spawn(chrome, [
            '--headless', '--no-first-run', '--no-default-browser-check',
            '--disable-background-networking', '--disable-component-update',
            '--disable-sync', '--disable-extensions',
            '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${path.join(dir, 'profile')}`,
            '--dump-dom', pathToFileURL(fixture).href
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

test('copy menu exports the supplied snapshot layout in order without speaker labels or controls', () => {
    // Structural markers from .scratch/chatgpt.html; private text/IDs are not retained.
    return runInBrowser(`
<div data-thread-user-message-navigation-content="true">
  <div data-turn-key="fixture-turn">
    <div data-user-message-bubble="true"><div>Fixture question</div></div>
    <button>Edit message</button>
    <div><h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4>
      <div><div data-markdown-text-style="assistant-message"><p>Fixture answer</p><pre><code>example()</code></pre></div></div>
    </div>
    <button>Copy answer</button>
  </div>
</div>`, state => {
        state.menus['Copy conversation JSON']();
        if (!state.clipboard) throw new Error('Copy menu did not export the rendered conversation');
        const data = JSON.parse(state.clipboard);
        if (data.messageCount !== 2) throw new Error('Expected both question and answer');
        if (data.messages[0].role !== 'user' || data.messages[1].role !== 'assistant') {
            throw new Error('Incorrect message order or roles');
        }
        if (data.messages[0].text !== 'Fixture question' || !data.messages[1].text.includes('example()')) {
            throw new Error('Message text or code was lost');
        }
        if (data.messages.some(message => /ChatGPT said:|Copy answer|Edit message/.test(message.text))) {
            throw new Error('Speaker labels or controls leaked into message text');
        }
        if (state.errors.length) throw new Error('Export logged an error');
    });
});

test('legacy wrappers export once when they contain current content markers', () => {
    return runInBrowser(`
<section data-message-author-role="user"><div data-message-content><div data-user-message-bubble="true">Legacy question</div></div><button>Edit</button></section>
<div data-message-author-role="assistant"><div class="markdown" data-markdown-text-style="assistant-message">Legacy answer</div><button>Copy</button></div>`, state => {
        state.menus['Copy conversation JSON']();
        const data = JSON.parse(state.clipboard);
        if (data.messageCount !== 2) throw new Error('Nested content markers duplicated legacy messages');
        if (data.messages[0].text !== 'Legacy question' || data.messages[1].text !== 'Legacy answer') {
            throw new Error('Legacy content extraction included controls or lost text');
        }
        if (data.messages[0].role !== 'user' || data.messages[1].role !== 'assistant') {
            throw new Error('Legacy roles were lost');
        }
    });
});

test('empty pages report a useful error and menus read messages inserted after startup', () => {
    return runInBrowser('<main><h1>Fixture title</h1><p>No transcript yet</p></main>', (state, doc) => {
        state.menus['Copy conversation JSON']();
        if (state.clipboard !== null || !state.alerts[0].includes('wait for its messages to load')) {
            throw new Error('Empty conversation must report the loading guidance');
        }
        doc.querySelector('main').insertAdjacentHTML('beforeend',
            '<div data-user-message-bubble="true">Loaded question</div><div data-markdown-text-style="assistant-message">Loaded answer</div>');
        state.menus['Copy conversation JSON']();
        const data = JSON.parse(state.clipboard);
        if (data.title !== 'Fixture title' || data.url !== 'https://chatgpt.com/c/fixture' || data.messageCount !== 2) {
            throw new Error('Menu did not read the newly loaded transcript and metadata');
        }
        if (!data.exportedAt || data.messages.some((message, index) => message.index !== index)) {
            throw new Error('Export schema changed');
        }
        state.menus['Show conversation stats']();
        if (!state.alerts.at(-1).includes('Messages: 2')) throw new Error('Stats did not read current messages');
        state.menus['Download conversation JSON']();
        if (state.downloads.length !== 1 || !state.downloads[0].url.startsWith('blob:') || !state.downloads[0].saveAs) {
            throw new Error('Download menu did not create its JSON download');
        }
        state.menus['Preview conversation JSON']();
        if (state.errors.length !== 1) throw new Error('Newly loaded conversation should not produce export errors');
    });
});

test('legacy layouts without current markers remain supported', () => {
    return runInBrowser('<div data-message-author-role="user"><div data-message-content>Old question</div></div><div data-message-author-role="assistant">Old answer</div>', state => {
        state.menus['Copy conversation JSON']();
        const data = JSON.parse(state.clipboard);
        if (data.messageCount !== 2 || data.messages[0].text !== 'Old question' || data.messages[1].text !== 'Old answer') {
            throw new Error('Old transcript markup is no longer supported');
        }
    });
});

test('optional local snapshot exports every rendered user and assistant body', {
    skip: !process.env.CHATGPT_SNAPSHOT
}, () => {
    const markup = fs.readFileSync(process.env.CHATGPT_SNAPSHOT, 'utf8');
    return runInBrowser(markup, (state, doc) => {
        const expected = [...doc.querySelectorAll('[data-user-message-bubble="true"], [data-markdown-text-style="assistant-message"]')];
        if (!expected.length) throw new Error('Snapshot contains no current transcript markers');
        state.menus['Copy conversation JSON']();
        if (!state.clipboard) throw new Error('Snapshot copy menu failed');
        const data = JSON.parse(state.clipboard);
        if (data.messageCount !== expected.length) throw new Error('Snapshot message count mismatch');
        expected.forEach((node, index) => {
            const role = node.hasAttribute('data-user-message-bubble') ? 'user' : 'assistant';
            if (data.messages[index].role !== role || data.messages[index].text !== node.innerText.trim()) {
                throw new Error('Snapshot role, order, or text mismatch');
            }
        });
        if (state.errors.length) throw new Error('Snapshot export logged an error');
    });
});
