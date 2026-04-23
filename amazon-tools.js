// ==UserScript==
// @name         Amazon Orders Today First
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Move orders arriving or delivered today to the top of the Amazon orders page
// @match        https://www.amazon.com/gp/css/order-history*
// @match        https://www.amazon.com/your-orders/orders*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ORDER_CARD_SELECTOR = '.order-card.js-order-card';
    const STATUS_SELECTOR = '.delivery-box__primary-text';
    const STYLE_ID = 'tm-amazon-orders-today-first-style';
    const SECTION_PREFIX = 'tm-amazon-orders-section';
    const STATUS_GROUPS = [
        {
            key: 'today',
            title: 'Delivering / Delivered Today',
            statuses: new Set(['arriving today', 'delivered today'])
        },
        {
            key: 'tomorrow',
            title: 'Arriving Tomorrow',
            statuses: new Set(['arriving tomorrow'])
        }
    ];

    let observer = null;
    let renderScheduled = false;

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            [id^="${SECTION_PREFIX}-banner-"] {
                margin: 0 0 12px;
            }

            [id^="${SECTION_PREFIX}-banner-"] .a-box-inner {
                padding: 12px 16px;
            }

            [id^="${SECTION_PREFIX}-banner-"] .tm-amazon-orders-section__title {
                font-weight: 700;
            }
        `;

        document.head.appendChild(style);
    }

    function normalizeText(text) {
        return text.replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function getStatusGroup(card) {
        const status = card.querySelector(STATUS_SELECTOR);
        if (!status) return null;

        const normalized = normalizeText(status.textContent || '');
        return STATUS_GROUPS.find(group => group.statuses.has(normalized)) || null;
    }

    function getCards() {
        return Array.from(document.querySelectorAll(ORDER_CARD_SELECTOR));
    }

    function getBannerId(groupKey) {
        return `${SECTION_PREFIX}-banner-${groupKey}`;
    }

    function getContentId(groupKey) {
        return `${SECTION_PREFIX}-content-${groupKey}`;
    }

    function buildSectionBanner(group) {
        const banner = document.createElement('div');
        banner.id = getBannerId(group.key);
        banner.className = 'a-box a-color-offset-background a-spacing-base';
        banner.innerHTML = `
            <div class="a-box-inner">
                <span class="tm-amazon-orders-section__title">${group.title}</span>
            </div>
        `;
        return banner;
    }

    function ensureSection(parent, beforeNode, group) {
        let banner = document.getElementById(getBannerId(group.key));
        if (!banner) {
            banner = buildSectionBanner(group);
        }

        parent.insertBefore(banner, beforeNode);

        let content = document.getElementById(getContentId(group.key));
        if (!content) {
            content = document.createElement('div');
            content.id = getContentId(group.key);
            parent.insertBefore(content, banner.nextSibling);
        }

        return { banner, content };
    }

    function render() {
        const cards = getCards();
        if (!cards.length) return;

        const parent = cards[0].parentElement;
        if (!parent) return;

        const groupedCards = new Map(STATUS_GROUPS.map(group => [group.key, []]));
        for (const card of cards) {
            const group = getStatusGroup(card);
            if (!group) continue;
            groupedCards.get(group.key).push(card);
        }

        for (const group of STATUS_GROUPS) {
            if (groupedCards.get(group.key).length) continue;

            const existingBanner = document.getElementById(getBannerId(group.key));
            const existingContent = document.getElementById(getContentId(group.key));
            if (existingBanner) {
                existingBanner.remove();
            }
            if (existingContent) {
                existingContent.remove();
            }
        }

        let insertionPoint = cards[0];
        for (const group of STATUS_GROUPS) {
            const matchingCards = groupedCards.get(group.key);
            if (!matchingCards.length) continue;

            const { banner, content } = ensureSection(parent, insertionPoint, group);
            const fragment = document.createDocumentFragment();
            for (const card of matchingCards) {
                fragment.appendChild(card);
            }
            content.replaceChildren(fragment);
            insertionPoint = content.nextSibling || banner.nextSibling;
        }
    }

    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;

        window.requestAnimationFrame(() => {
            renderScheduled = false;
            render();
        });
    }

    function initObserver() {
        if (observer) return;

        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;

                if (mutation.target instanceof Element && mutation.target.closest(ORDER_CARD_SELECTOR)) {
                    scheduleRender();
                    return;
                }

                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches?.(ORDER_CARD_SELECTOR) || node.querySelector?.(ORDER_CARD_SELECTOR)) {
                        scheduleRender();
                        return;
                    }
                }
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        injectStyles();
        render();
        initObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
