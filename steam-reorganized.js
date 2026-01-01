// ==UserScript==
// @name         Steam Reorganizer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  reorganize steam product information
// @match        https://store.steampowered.com/app/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DECK_SELECTOR = '[data-featuretarget="deck-verified-results"]';
    const CATEGORY_SELECTOR = '#category_block';
    const SIDEBAR_SELECTOR = '#responsive_apppage_details_right_ctn';
    const PLATFORM_SOURCE_SELECTOR = '#game_area_purchase_platform, .game_area_purchase_platform';
    const PLATFORM_BADGE_ID = 'deck-platform-compatibility-badges';
    const PLATFORM_ORDER = [
        { key: 'win', label: 'Windows' },
        { key: 'mac', label: 'macOS' },
        { key: 'linux', label: 'Linux' }
    ];

    function readCompatiblePlatforms() {
        const source = document.querySelector(PLATFORM_SOURCE_SELECTOR);
        if (!source) return [];

        return PLATFORM_ORDER.filter(platform =>
            source.querySelector(`.platform_img.${platform.key}`)
        );
    }

    function buildPlatformBadges(platforms) {
        if (!platforms.length) return null;

        const wrapper = document.createElement('div');
        wrapper.id = PLATFORM_BADGE_ID;
        wrapper.style.marginTop = '8px';
        wrapper.style.marginBottom = '8px';

        const label = document.createElement('div');
        label.textContent = 'Platforms';
        label.style.fontSize = '12px';
        label.style.textTransform = 'uppercase';
        label.style.opacity = '0.7';
        label.style.marginBottom = '4px';
        wrapper.appendChild(label);

        const icons = document.createElement('div');
        icons.style.display = 'flex';
        icons.style.gap = '8px';

        platforms.forEach(platform => {
            const icon = document.createElement('span');
            icon.className = `platform_img ${platform.key}`;
            icon.title = platform.label;
            icon.setAttribute('aria-label', platform.label);
            icons.appendChild(icon);
        });

        wrapper.appendChild(icons);
        return wrapper;
    }

    function moveDeckBlock() {
        const deckBlock = document.querySelector(DECK_SELECTOR);
        const categoryBlock = document.querySelector(CATEGORY_SELECTOR);
        const sidebar = document.querySelector(SIDEBAR_SELECTOR);

        if (!deckBlock) return false;

        if (categoryBlock) {
            categoryBlock.parentElement.insertBefore(deckBlock, categoryBlock);
            const platforms = readCompatiblePlatforms();
            const existingBadges = document.getElementById(PLATFORM_BADGE_ID);
            if (existingBadges) existingBadges.remove();
            const badges = buildPlatformBadges(platforms);
            if (badges) deckBlock.insertAdjacentElement('afterend', badges);
            return true;
        }

        if (!sidebar) return false;
        if (sidebar.firstElementChild === deckBlock) return true;

        sidebar.insertBefore(deckBlock, sidebar.firstElementChild);
        const platforms = readCompatiblePlatforms();
        const existingBadges = document.getElementById(PLATFORM_BADGE_ID);
        if (existingBadges) existingBadges.remove();
        const badges = buildPlatformBadges(platforms);
        if (badges) deckBlock.insertAdjacentElement('afterend', badges);
        return true;
    }

    function init() {
        if (moveDeckBlock()) return;

        const observer = new MutationObserver(() => {
            if (moveDeckBlock()) observer.disconnect();
        });

        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => observer.disconnect(), 10000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
