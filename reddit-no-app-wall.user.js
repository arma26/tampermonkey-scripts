// ==UserScript==
// @name         Reddit - No App Wall
// @namespace    local.reddit-no-app-wall
// @version      1.1.0
// @description  Remove Reddit's mobile app walls without hiding ordinary posts or dialogs.
// @match        https://www.reddit.com/*
// @match        https://reddit.com/*
// @match        https://m.reddit.com/*
// @match        https://sh.reddit.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    function isWallHeading(text) {
        return /^get the app to keep (?:reading|using reddit)[.!]?$/i.test(text.trim().replace(/\s+/g, ' '));
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = { isWallHeading };
    if (typeof document === 'undefined') return;

    try {
        // Best-effort suppression; DOM cleanup does not depend on this flag.
        localStorage.setItem('xpromo-consolidation', new Date().toString());
    } catch (_) { /* Storage may be disabled. */ }

    // These walls can be separate portal divs, not HTML/ARIA dialogs.
    const walls = [
        '#app-upsell-blocking-bottom-sheet-direct', '#app-upsell-blocking-bottom-sheet-seo',
        'app-upsell-blocking-bottom-sheet-direct', 'app-upsell-blocking-bottom-sheet-seo',
        '#xpromo-bottom-sheet', '.configured-xpromo', '.configured-xpromo-bottom-sheet',
        '.configured-xpromo-full-screen'
    ].join(',');
    const dialogs = 'dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"], ' +
        '.rpl-bottom-sheet, .rpl-dialog, faceplate-dialog[open], faceplate-modal[open], ' +
        'faceplate-bottom-sheet[open], [role="menu"], [popover]:popover-open';
    const content = 'article, shreddit-post, shreddit-comment, textarea, [contenteditable="true"]';
    const locks = ['rpl-scroll-lock', 'scroll-is-blocked', 'scroll-disabled'];
    const pendingOwners = new WeakSet();
    let sawWall = false;

    function dismissOwner(owner) {
        owner.dispatchEvent(new CustomEvent('dismiss-configured-xpromo'));
        const components = [owner, ...owner.querySelectorAll('rpl-bottom-sheet, rpl-dialog')];
        if (pendingOwners.has(owner) || components.every(node => customElements.get(node.localName))) return;
        pendingOwners.add(owner);
        // document-start cleanup can precede custom-element upgrade. A lost
        // dismissal leaves Reddit's focus/gesture locks alive after removal.
        Promise.all(components.map(node => customElements.whenDefined(node.localName)))
            .then(async () => {
                await owner.updateComplete;
                if (owner.isConnected) owner.dispatchEvent(new CustomEvent('dismiss-configured-xpromo'));
            }).catch(() => { /* Keep DOM cleanup working if component hydration fails. */ });
    }

    function removeWall(wall) {
        if (!wall.isConnected) return;
        sawWall = true;
        let owner = wall.closest('configured-xpromo-modal');
        if (!owner && wall.id) {
            owner = Array.from(document.querySelectorAll('configured-xpromo-modal')).find(node =>
                Array.from(node.querySelectorAll('[dialog-id]')).some(sheet =>
                    sheet.getAttribute('dialog-id') === wall.id));
        }
        // Use Reddit's own teardown path when available, to release its locks.
        if (owner) dismissOwner(owner);
        wall.querySelector('button[aria-label="Close" i], button[aria-label="Dismiss" i]')?.click();
        for (const node of [wall, ...wall.querySelectorAll('dialog[open], [popover]')]) {
            if (node.localName === 'dialog' && node.open) node.close();
            if (node.matches('[popover]:popover-open')) node.hidePopover();
        }
        wall.remove();
    }

    function unlockPage() {
        // Ordinary login, reply, menus, etc. must keep their modal behavior.
        if (Array.from(document.querySelectorAll(dialogs)).some(node =>
            node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden')) return;
        for (const node of document.querySelectorAll('html, body, shreddit-app, main, #main-content')) {
            if (locks.some(name => node.classList.contains(name))) node.classList.remove(...locks);
            for (const property of ['overflow', 'overflow-y', 'pointer-events', 'touch-action']) {
                if (/^(hidden|clip|none)$/.test(node.style.getPropertyValue(property))) {
                    const horizontal = node.style.overflowX;
                    node.style.removeProperty(property);
                    // Normal mobile layout may intentionally clip horizontally.
                    if (property === 'overflow' && horizontal === 'clip') node.style.overflowX = horizontal;
                }
            }
            if (node.hasAttribute('inert')) node.removeAttribute('inert');
        }
    }

    function clean() {
        for (const wall of document.querySelectorAll(walls)) removeWall(wall);
        for (const dialog of document.querySelectorAll('dialog, [role="dialog"], [aria-modal="true"]')) {
            if (dialog.matches(content) || dialog.querySelector(content)) continue;
            const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
            if (heading && isWallHeading(heading.textContent)) removeWall(dialog);
        }
        // A/B tests may rename the portal: require both the exact heading and
        // its app-promotion button, inside a modal/fixed shell, never a post.
        for (const heading of document.querySelectorAll('h1, h2, h3, [role="heading"]')) {
            if (!isWallHeading(heading.textContent) || heading.closest(content)) continue;
            for (let node = heading.parentElement; node; node = node.parentElement) {
                if (node.matches('html, body, main, shreddit-app, #main-content') || node.querySelector(content)) break;
                const modal = node.matches('.rpl-bottom-sheet, .rpl-dialog, [aria-modal="true"], [role="dialog"]');
                if (!(modal || getComputedStyle(node).position === 'fixed')) continue;
                if (node.querySelector('a.app-link[data-testid="primary-button"]' +
                    '[href^="https://reddit.onelink.me/"][href*="page_fade_blocking"]')) {
                    removeWall(node);
                    break;
                }
            }
        }
        if (sawWall) unlockPage();
    }

    let scheduled = false;
    new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        setTimeout(() => { scheduled = false; clean(); }, 25);
    }).observe(document, {
        subtree: true, childList: true, characterData: true, attributes: true,
        attributeFilter: ['id', 'class', 'style', 'open', 'inert', 'role', 'aria-modal']
    });
    clean();
})();
