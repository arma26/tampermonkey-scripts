// ==UserScript==
// @name         X Stay on Web
// @namespace    https://github.com/arma26/tampermonkey-scripts
// @version      1.1.0
// @description  Keep X links on the web and suppress app promotions and Google One Tap.
// @match        https://x.com/*
// @match        https://*.x.com/*
// @match        https://twitter.com/*
// @match        https://*.twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function isWebHost(hostname) {
        return /^(?:(?:www|m|mobile)\.)?(?:x|twitter)\.com$/.test(hostname);
    }

    function isAppLink(value) {
        try {
            const url = new URL(value, 'https://x.com');
            return /^(twitter|x|intent|market|itms-apps|itms|x-safari-https):$/.test(url.protocol) ||
                (/^https?:$/.test(url.protocol) && (
                    (isWebHost(url.hostname) && url.searchParams.has('launch_app_store')) ||
                    /^(apps\.apple\.com|itunes\.apple\.com)$/.test(url.hostname) ||
                    (url.hostname === 'play.google.com' && url.pathname.startsWith('/store/apps/')) ||
                    /^(twitter|x)\.app\.link$/.test(url.hostname)
                ));
        } catch (_) {
            return false;
        }
    }

    function webTarget(value, current) {
        try {
            const url = new URL(value, current);
            if (/^https?:$/.test(url.protocol) && isWebHost(url.hostname) &&
                url.searchParams.has('launch_app_store')) {
                url.protocol = 'https:';
                url.hostname = 'x.com';
                for (const key of ['launch_app_store', 'ct', 'ppid', 'source']) {
                    url.searchParams.delete(key);
                }
                return url.href;
            }
            if (/^(twitter|x):$/.test(url.protocol)) {
                if (url.hostname === 'status' && /^\d+$/.test(url.searchParams.get('id') || '')) {
                    return 'https://x.com/i/status/' + url.searchParams.get('id');
                }
                if (url.hostname === 'user' && /^[A-Za-z0-9_]+$/.test(url.searchParams.get('screen_name') || '')) {
                    return 'https://x.com/' + url.searchParams.get('screen_name');
                }
            }
            if (url.protocol === 'intent:') {
                const fallback = value.match(/;S\.browser_fallback_url=([^;]+)/);
                if (fallback) {
                    const target = new URL(decodeURIComponent(fallback[1]));
                    if (target.protocol === 'https:' && /^(www\.)?(x|twitter)\.com$/.test(target.hostname)) return target.href;
                }
            }
        } catch (_) { /* An unrecognized app link stays on the current page. */ }
        return current;
    }

    function isPromotion(text) {
        return /\b(open|use|install|get|download|continue (?:in|with))\s+(?:the\s+)?(?:x|twitter)\s+app\b/i.test(text) ||
            /\bsee (?:this|the) post in (?:the )?app\b/i.test(text) ||
            /\b(?:see|view) all (?:the )?replies\b/i.test(text);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { isAppLink, webTarget, isPromotion };
    }
    if (typeof document === 'undefined') return;
    if (!isWebHost(new URL(location.href).hostname)) return;

    // The captured X entry client skips automatic forwarding when ct is set.
    // Clean launch URLs need a fresh load so server/router boot data is clean too.
    const initialUrl = new URL(webTarget(location.href, location.href));
    if (!initialUrl.searchParams.get('ct')) initialUrl.searchParams.set('ct', 'tm-stay-on-web');
    if (isAppLink(location.href)) {
        location.replace(initialUrl.href);
        return;
    }
    if (initialUrl.href !== location.href) {
        history.replaceState(history.state, '', initialUrl.href);
    }

    // Capture before React handles a tap and launches a native-app/store URL.
    document.addEventListener('click', function (event) {
        const anchor = event.target.closest && event.target.closest('a[href]');
        if (!anchor || !isAppLink(anchor.href)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = webTarget(anchor.href, location.href);
        if (target !== location.href) location.assign(target);
    }, true);

    const pendingDismissals = new WeakSet();
    function hidePromotion(node) {
        if (node.style.getPropertyValue('display') !== 'none' ||
            node.style.getPropertyPriority('display') !== 'important') {
            node.style.setProperty('display', 'none', 'important');
        }
    }

    function blockGooglePrompt() {}
    function suppressGooglePrompt() {
        const api = window.google?.accounts?.id;
        if (typeof api?.prompt === 'function' && api.prompt !== blockGooglePrompt) {
            api.prompt = blockGooglePrompt;
            try { api.cancel?.(); } catch (_) { /* The SDK may not be initialized yet. */ }
        }
        for (const node of document.querySelectorAll(
            '#credential_picker_container, #credential_picker_iframe, ' +
            'iframe[src^="https://accounts.google.com/gsi/iframe/select"]'
        )) hidePromotion(node);
    }
    // Capture the SDK's load before X's onload callback can start One Tap/FedCM.
    document.addEventListener('load', suppressGooglePrompt, true);

    function dismissPromotions() {
        suppressGooglePrompt();
        const candidates = document.querySelectorAll(
            '[data-interaction="app-store-obstruction"], [role="dialog"], ' +
            '[aria-modal="true"], [data-testid="BottomSheet"], aside.fixed'
        );
        for (const dialog of candidates) {
            const knownObstruction = dialog.matches('[data-interaction="app-store-obstruction"]');
            if (dialog.getAttribute('data-state') === 'closed') continue;
            const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
            if (!knownObstruction && (dialog.querySelector(
                'article, [data-testid="tweet"], textarea, [contenteditable="true"], [role="textbox"]'
            ) || !(isPromotion(heading?.textContent || '') || isPromotion(dialog.textContent || '')))) continue;
            if (dialog.matches('aside.fixed')) {
                hidePromotion(dialog);
                continue;
            }
            const close = dialog.querySelector(
                '[data-testid="app-bar-close"], [aria-label="Close"], [aria-label="Dismiss"]'
            ) || (knownObstruction && dialog.querySelector('[data-icon="icon-close-md"]')?.closest('button'));
            // X's own dismiss handler releases its wheel/touch/key locks. Removing
            // or merely hiding a modal would leave those handlers behind.
            if (!close && !knownObstruction) continue;
            hidePromotion(dialog);
            if (pendingDismissals.has(dialog)) continue;
            pendingDismissals.add(dialog);
            if (close) close.click();
            // A document-start click can precede hydration. Retry until X handles it.
            setTimeout(function () {
                pendingDismissals.delete(dialog);
                if (dialog.isConnected && dialog.getAttribute('data-state') !== 'closed') {
                    dismissPromotions();
                }
            }, 400);
        }
        for (const link of document.querySelectorAll('a[href]')) {
            if (isAppLink(link.href)) {
                const target = webTarget(link.href, location.href);
                if (target !== location.href) link.href = target;
            }
        }
    }

    let scheduled = false;
    const observer = new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(function () {
            scheduled = false;
            dismissPromotions();
        });
    });
    observer.observe(document, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['href', 'src', 'id', 'class', 'style', 'role', 'aria-modal',
            'data-state', 'data-interaction', 'data-testid']
    });
    dismissPromotions();
})();
