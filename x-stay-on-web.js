// ==UserScript==
// @name         X Stay on Web
// @namespace    https://github.com/arma26/tampermonkey-scripts
// @version      1.0.0
// @description  Dismiss X app promotions and keep app/store links in the browser.
// @match        https://x.com/*
// @match        https://*.x.com/*
// @match        https://twitter.com/*
// @match        https://*.twitter.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function isAppLink(value) {
        try {
            const url = new URL(value, 'https://x.com');
            return /^(twitter|x|intent|market|itms-apps|itms):$/.test(url.protocol) ||
                /^(apps\.apple\.com|itunes\.apple\.com)$/.test(url.hostname) ||
                (url.hostname === 'play.google.com' && url.pathname.startsWith('/store/apps')) ||
                /^(twitter|x)\.app\.link$/.test(url.hostname);
        } catch (_) {
            return false;
        }
    }

    function webTarget(value, current) {
        try {
            const url = new URL(value, current);
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
            /\b(?:see|view) all replies\b[\s\S]*\b(?:app|download)\b/i.test(text);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { isAppLink, webTarget, isPromotion };
    }
    if (typeof document === 'undefined') return;

    // Capture before React handles a tap and launches a native-app/store URL.
    document.addEventListener('click', function (event) {
        const anchor = event.target.closest && event.target.closest('a[href]');
        if (!anchor || !isAppLink(anchor.href)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const target = webTarget(anchor.href, location.href);
        if (target !== location.href) location.assign(target);
    }, true);

    const dismissed = new WeakSet();
    function dismissPromotions() {
        const candidates = document.querySelectorAll(
            '[role="dialog"], [aria-modal="true"], [data-testid="BottomSheet"]'
        );
        for (const dialog of candidates) {
            if (dismissed.has(dialog) || !isPromotion(dialog.textContent || '')) continue;
            const close = dialog.querySelector(
                '[data-testid="app-bar-close"], [aria-label="Close"], [aria-label="Dismiss"]'
            );
            if (close) {
                dismissed.add(dialog);
                close.click();
            } else {
                // Hide only the identified promotion, never X's entire modal layer.
                dialog.style.setProperty('display', 'none', 'important');
            }
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
    observer.observe(document, { childList: true, subtree: true, characterData: true });
    dismissPromotions();
})();
