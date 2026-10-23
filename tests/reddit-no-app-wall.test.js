const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const scriptPath = process.env.REDDIT_SCRIPT || path.join(__dirname, '..', 'reddit-no-app-wall.user.js');
const script = fs.readFileSync(scriptPath, 'utf8');
const chrome = process.env.CHROME_BIN || (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'chromium');

// Minimal structure from the supplied mobile markup; tracking/account values omitted.
const markup = `<div class="flex flex-col gap-sm">
  <img alt="Reddit app icon">
  <div class="flex flex-col gap-xs">
    <h1 class="text-title-1 m-0 text-neutral-content-strong">Get the app to keep using Reddit</h1>
    <p>Search better, personalize your feed, and never miss an update on your favorite communities.</p>
  </div>
</div>
<a class="app-link" data-testid="primary-button" slot="primary-button"
 href="https://reddit.onelink.me/MRHZ?af_sub4=page_fade_blocking&af_sub2=page_fade_blocking">Get the Reddit App</a>`;

// Real Chromium DOM, no account/profile or live page requests. Profiles are retained.
function runInBrowser(check) {
    const scratch = process.env.TMPDIR || path.join(os.homedir(), '.hermes', 'cache', 'scratch');
    const dir = fs.mkdtempSync(path.join(scratch, 'reddit-app-wall-test-'));
    const file = path.join(dir, 'fixture.html');
    const input = JSON.stringify({ script, markup, check: check.toString() }).replace(/</g, '\\u003c');
    fs.writeFileSync(file, `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'">
<style>body { min-height: 4000px } .rpl-scroll-lock { overflow: hidden } </style>
<main id="main-content"><article id="post">Normal post content</article><button id="ordinary-button">Reply</button></main>
<pre id="result"></pre><script>
const input = ${input};
const check = new Function('return (' + input.check + ')')();
const wait = () => new Promise(resolve => setTimeout(resolve, 80));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const add = (markup, attributes = {}) => {
    const node = document.createElement('div');
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    node.innerHTML = markup;
    document.body.append(node);
    return node;
};
(async () => {
    try {
        new Function(input.script)();
        await check({ markup: input.markup, wait, assert, add });
        document.getElementById('result').textContent = btoa(JSON.stringify({ ok: true }));
    } catch (error) {
        document.getElementById('result').textContent = btoa(JSON.stringify({ ok: false, error: error.message }));
    }
})();
</script>`, { flag: 'wx' });
    return new Promise((resolve, reject) => {
        const child = spawn(chrome, [
            '--headless', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
            '--disable-component-update', '--disable-sync', '--disable-extensions',
            '--host-resolver-rules=MAP * ~NOTFOUND', `--user-data-dir=${path.join(dir, 'profile')}`,
            '--dump-dom', '--virtual-time-budget=3000', pathToFileURL(file).href
        ], { stdio: ['ignore', 'pipe', 'ignore'] });
        let output = '';
        let finished = false;
        const finish = error => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            child.kill();
            child.stdout.destroy();
            child.unref();
            if (error) reject(error); else resolve();
        };
        const timer = setTimeout(() => finish(new Error('No browser test result; fixture: ' + file)), 15000);
        child.on('error', finish);
        child.on('exit', () => { if (!finished) finish(new Error('Browser exited without a test result')); });
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

test('recognizes only the app-wall heading, not a post mentioning it', () => {
    const { isWallHeading } = require('../reddit-no-app-wall.user.js');
    assert.equal(isWallHeading('Get the app to keep using Reddit'), true);
    assert.equal(isWallHeading(' Get the app to keep\nreading '), true);
    assert.equal(isWallHeading('How do I remove Get the app to keep using Reddit?'), false);
});

test('finds a renamed fixed-position wall using the supplied heading and app button', () => {
    return runInBrowser(async ({ markup, wait, assert, add }) => {
        const wall = add(markup, { style: 'position:fixed;inset:0' });
        await wait();
        assert(!wall.isConnected || getComputedStyle(wall).display === 'none', 'Unrecognized portal still blocks reading');
        assert(document.getElementById('post').isConnected, 'Normal content was removed with the portal');
    });
});

test('preserves posts quoting the app wall and ordinary modal locks', () => {
    return runInBrowser(async ({ markup, wait, assert, add }) => {
        const post = document.getElementById('post');
        post.innerHTML = markup;
        const ordinary = add('<h1>Log in</h1><input><button>Continue</button>', { role: 'dialog' });
        document.body.style.overflow = 'hidden';
        const wall = add(markup, { id: 'app-upsell-blocking-bottom-sheet-seo' });
        await wait();
        assert(!wall.isConnected, 'Known promotion portal was not removed');
        assert(post.querySelector('h1')?.textContent === 'Get the app to keep using Reddit', 'Post text was removed');
        assert(ordinary.isConnected && getComputedStyle(ordinary).display !== 'none', 'Ordinary login dialog was removed');
        assert(document.body.style.overflow === 'hidden', 'Ordinary modal lost its scroll lock');
        ordinary.remove();
        await wait();
        assert(document.body.style.overflow !== 'hidden', 'Scroll was not released after the ordinary modal closed');
    });
});

test('handles attribute-only portal reuse and native dialog teardown', () => {
    return runInBrowser(async ({ markup, wait, assert, add }) => {
        const wall = add(markup);
        await wait();
        assert(wall.isConnected, 'Unrelated non-modal markup was removed');
        wall.className = 'configured-xpromo-bottom-sheet';
        await wait();
        assert(!wall.isConnected, 'Attribute-only promotion identification was missed');
        const dialog = document.createElement('dialog');
        dialog.innerHTML = markup;
        document.body.append(dialog);
        dialog.showModal();
        await wait();
        assert(!dialog.open && !dialog.isConnected, 'Native modal stayed in the top layer');
        let clicks = 0;
        const button = document.getElementById('ordinary-button');
        button.addEventListener('click', () => clicks++);
        button.click();
        assert(clicks === 1 && !button.closest('[inert]'), 'Ordinary controls became unusable');
    });
});

test('uses the configured promotion owner dismissal event', () => {
    return runInBrowser(async ({ markup, wait, assert, add }) => {
        let dismissed = 0;
        const owner = document.createElement('configured-xpromo-modal');
        owner.innerHTML = '<rpl-bottom-sheet dialog-id="app-upsell-blocking-bottom-sheet-direct"></rpl-bottom-sheet>';
        owner.addEventListener('dismiss-configured-xpromo', () => dismissed++);
        document.body.append(owner);
        const wall = add(markup, { id: 'app-upsell-blocking-bottom-sheet-direct' });
        await wait();
        assert(!wall.isConnected && dismissed === 1, 'Reddit dismissal path was not called');
    });
});

test('releases HAR-style wheel locks when the promotion upgrades after document-start cleanup', () => {
    return runInBrowser(async ({ markup, wait, assert, add }) => {
        const block = event => event.preventDefault();
        document.addEventListener('wheel', block, { passive: false });
        const owner = document.createElement('configured-xpromo-modal');
        owner.innerHTML = '<rpl-bottom-sheet dialog-id="configured-xpromo-global_non_direct_blocking" open></rpl-bottom-sheet>';
        document.body.append(owner);
        const wall = add(markup, {
            id: 'configured-xpromo-global_non_direct_blocking',
            class: 'configured-xpromo configured-xpromo-bottom-sheet'
        });
        await wait();
        assert(!wall.isConnected, 'Initial promotion was not suppressed');
        // Synthetic lifecycle adapters for the HAR's public dismissal/hide path.
        customElements.define('rpl-bottom-sheet', class extends HTMLElement {
            hide() {
                this.removeAttribute('open');
                document.removeEventListener('wheel', block);
            }
        });
        customElements.define('configured-xpromo-modal', class extends HTMLElement {
            connectedCallback() {
                this.addEventListener('dismiss-configured-xpromo', () => {
                    this.querySelector('rpl-bottom-sheet').hide();
                    this.remove();
                });
            }
        });
        await wait();
        const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
        document.getElementById('post').dispatchEvent(wheel);
        assert(!wheel.defaultPrevented, 'Promotion wheel listener survived delayed hydration');
        assert(!owner.isConnected, 'Hydrated promotion owner was never dismissed');
    });
});

test('dismisses the supplied app-wall contents in a non-dialog mobile portal', () => {
    return runInBrowser(async ({ markup, wait, assert, add }) => {
        document.body.classList.add('rpl-scroll-lock');
        document.body.style.overflow = 'hidden';
        document.body.style.pointerEvents = 'none';
        const wall = add(markup, { class: 'configured-xpromo-bottom-sheet', style: 'position:fixed;inset:0' });
        await wait();
        assert(!wall.isConnected || getComputedStyle(wall).display === 'none', 'Non-dialog app wall remains visible');
        assert(getComputedStyle(document.body).overflowY !== 'hidden', 'Page scroll remains locked');
        assert(getComputedStyle(document.body).pointerEvents !== 'none', 'Page taps remain blocked');
        assert(document.getElementById('post').isConnected, 'Ordinary post was removed');
    });
});
