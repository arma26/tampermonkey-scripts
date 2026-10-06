const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const scriptPath = path.join(__dirname, '..', 'x-stay-on-web.js');
const { isAppLink, webTarget, isPromotion } = require(scriptPath);

// HAR: open-app-button-ZGaHmcos.js builds m.x.com URLs with launch_app_store.
const post = 'https://x.com/marceelias/status/2107183773490065832';
const appLink = post.replace('://x.com', '://m.x.com') +
    '?launch_app_store=true&ct=post-timeline&ppid=campaign&source=dir&s=20#replies';

test('recognizes X mobile app-launch links and keeps their post on the web', () => {
    assert.equal(isAppLink(appLink), true);
    assert.equal(webTarget(appLink, post), post + '?s=20#replies');
});

function boot(url, google) {
    const state = { replacements: [], observations: 0, historyWrites: [], listeners: {} };
    const location = { href: url, replace(value) { state.replacements.push(value); } };
    const history = {
        state: { preserved: true },
        replaceState(value, title, target) {
            state.historyWrites.push({ value, target });
            location.href = target;
        }
    };
    const window = { google, addEventListener() {} };
    vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), {
        URL, location, history, window,
        document: {
            addEventListener(type, callback) { (state.listeners[type] ||= []).push(callback); },
            querySelectorAll() { return []; }
        },
        MutationObserver: class { observe() { state.observations += 1; } }
    });
    state.window = window;
    state.url = location.href;
    return state;
}

// HAR: entry-client-logged-out-C20VJ39L.js skips automatic browser/app
// forwarding when location.search contains a nonempty ct value.
test('suppresses automatic forwarding before page boot without reloading clean links', () => {
    const state = boot(post + '?s=20#replies');
    const url = new URL(state.url);
    assert.equal(url.searchParams.get('ct'), 'tm-stay-on-web');
    assert.equal(url.searchParams.get('s'), '20');
    assert.equal(url.hash, '#replies');
    assert.deepEqual(state.historyWrites[0].value, { preserved: true });
    assert.deepEqual(state.replacements, []);
});

// HAR: modal-CqbTXeCz.js / _id-BrAkeod9.js and the logged-out banner.
test('recognizes the actual obstruction title and replies banner heading', () => {
    assert.equal(isPromotion('See this post in the app'), true);
    assert.equal(isPromotion('See all the replies Continue to X'), true);
    assert.equal(isPromotion('See all replies Open X App'), true);
    assert.equal(isPromotion('Log in to X'), false);
    assert.equal(isPromotion('Compose a post'), false);
});

// HAR: new-to-x-card-Os01qmPK.js uses the GIS prompt API with FedCM enabled.
test('blocks Google One Tap prompts and cancels an already initialized SDK', () => {
    let prompts = 0;
    let cancellations = 0;
    const google = { accounts: { id: {
        prompt() { prompts += 1; },
        cancel() { cancellations += 1; }
    } } };
    boot(post, google);
    google.accounts.id.prompt();
    assert.equal(prompts, 0);
    assert.equal(cancellations, 1);
});

test('reloads incoming launch links once with clean server/router boot data', () => {
    const state = boot(appLink);
    assert.equal(state.replacements.length, 1);
    const target = new URL(state.replacements[0]);
    assert.equal(target.hostname, 'x.com');
    assert.equal(target.searchParams.has('launch_app_store'), false);
    assert.equal(target.searchParams.get('ct'), 'tm-stay-on-web');
    assert.equal(target.searchParams.has('ppid'), false);
    assert.equal(target.searchParams.has('source'), false);
    assert.equal(target.searchParams.get('s'), '20');
    assert.equal(target.hash, '#replies');
    assert.equal(state.observations, 0);
    assert.deepEqual(boot(target.href).replacements, []);
});

test('preserves existing nonempty attribution without an extra history write', () => {
    const state = boot(post + '?ct=google-seo&s=20');
    assert.equal(state.url, post + '?ct=google-seo&s=20');
    assert.deepEqual(state.historyWrites, []);
});

test('does not alter other X subdomains', () => {
    const state = boot('https://api.x.com/example');
    assert.equal(state.observations, 0);
    assert.deepEqual(state.historyWrites, []);
});

test('blocks an asynchronously loaded Google SDK before its load handler prompts', () => {
    const state = boot(post);
    let prompts = 0;
    let cancellations = 0;
    const id = { prompt() { prompts += 1; }, cancel() { cancellations += 1; } };
    state.window.google = { accounts: { id } };
    for (const callback of state.listeners.load) callback();
    id.prompt();
    for (const callback of state.listeners.load) callback();
    assert.equal(prompts, 0);
    assert.equal(cancellations, 1);
});

test('tolerates cancel before GIS initialization without changing renderButton', () => {
    const renderButton = () => 'manual sign-in button';
    const id = { prompt() { assert.fail('One Tap must be blocked'); },
        cancel() { throw new Error('not initialized'); }, renderButton };
    assert.doesNotThrow(() => boot(post, { accounts: { id } }));
    assert.doesNotThrow(() => id.prompt());
    assert.equal(id.renderButton, renderButton);
});

test('keeps recognized native post and profile deep links on the web', () => {
    assert.equal(webTarget('twitter://status?id=2107183773490065832', post),
        'https://x.com/i/status/2107183773490065832');
    assert.equal(webTarget('twitter://user?screen_name=marceelias', post), 'https://x.com/marceelias');
    assert.equal(webTarget('twitter://status?id=bad', post), post);
    assert.equal(webTarget('twitter://user?screen_name=bad/name', post), post);
});

test('recognizes captured store schemes without intercepting lookalike hosts', () => {
    for (const value of ['market://details?id=com.twitter.android',
        'https://apps.apple.com/app/apple-store/id333903271',
        'https://play.google.com/store/apps/details?id=com.twitter.android',
        'x-safari-https://apps.apple.com/app/apple-store/id333903271']) {
        assert.equal(isAppLink(value), true, value);
    }
    for (const value of [post, post + '?ct=google-seo', 'https://example.com/?launch_app_store=true',
        'https://x.com.evil.test/?launch_app_store=true', 'https://apps.apple.com.evil.test/',
        'javascript://apps.apple.com/', 'https://play.google.com/log']) {
        assert.equal(isAppLink(value), false, value);
    }
});

test('only accepts HTTPS X/Twitter browser fallbacks from intent URLs', () => {
    const current = 'https://x.com/home';
    assert.equal(webTarget('intent://status#Intent;S.browser_fallback_url=' +
        encodeURIComponent(post) + ';end', current), post);
    for (const fallback of ['https://evil.test/', 'javascript:alert(1)', 'https://x.com.evil.test/']) {
        assert.equal(webTarget('intent://status#Intent;S.browser_fallback_url=' +
            encodeURIComponent(fallback) + ';end', current), current);
    }
});
