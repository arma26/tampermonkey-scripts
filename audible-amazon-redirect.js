// ==UserScript==
// @name         Audible Amazon Redirect
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add a button on Audible book pages to search the title on Amazon
// @match        https://www.audible.com/pd/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'tm-audible-amazon-redirect-button';
    const STYLE_ID = 'tm-audible-amazon-redirect-style';
    const TITLE_SELECTORS = [
        'h1',
        'meta[property="og:title"]',
        'meta[name="twitter:title"]'
    ];
    const ACTION_CONTAINER_SELECTORS = [
        '[data-testid="purchase-cta-section"]',
        '[data-testid="buybox-primary-cta"]',
        '[data-testid="buybox"]',
        '.bc-container .adblBuyBoxArea',
        '.adblBuyBoxArea',
        'main'
    ];

    let observer = null;
    let renderScheduled = false;

    function normalizeWhitespace(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function extractContentValue(node) {
        if (!node) return '';
        if (typeof node.content === 'string') {
            return normalizeWhitespace(node.content);
        }
        return normalizeWhitespace(node.textContent || '');
    }

    function extractBookTitle(doc) {
        if (!doc || typeof doc.querySelector !== 'function') return '';

        for (const selector of TITLE_SELECTORS) {
            const node = doc.querySelector(selector);
            const value = extractContentValue(node);
            if (value) return value;
        }

        return '';
    }

    function buildAmazonSearchUrl(title) {
        const normalizedTitle = normalizeWhitespace(title);
        const url = new URL('https://www.amazon.com/s');
        url.searchParams.set('k', normalizedTitle);
        return url.toString();
    }

    function buildButtonLabel(title) {
        const normalizedTitle = normalizeWhitespace(title);
        if (!normalizedTitle) return 'Search Amazon';
        return `Search Amazon for "${normalizedTitle}"`;
    }

    function findActionContainer(doc) {
        if (!doc || typeof doc.querySelector !== 'function') return null;

        for (const selector of ACTION_CONTAINER_SELECTORS) {
            const node = doc.querySelector(selector);
            if (node) return node;
        }

        return null;
    }

    function injectStyles(doc) {
        if (!doc || doc.getElementById(STYLE_ID)) return;

        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                margin-top: 12px;
                padding: 10px 14px;
                border: 1px solid #111111;
                border-radius: 999px;
                background: #ffffff;
                color: #111111;
                font: inherit;
                font-weight: 600;
                line-height: 1.2;
                text-decoration: none;
                cursor: pointer;
            }

            #${BUTTON_ID}:hover {
                background: #f5f5f5;
            }
        `;

        doc.head?.appendChild(style);
    }

    function createButton(doc, title) {
        const button = doc.createElement('a');
        button.id = BUTTON_ID;
        button.href = buildAmazonSearchUrl(title);
        button.textContent = buildButtonLabel(title);
        button.setAttribute('role', 'button');
        return button;
    }

    function renderButton(doc) {
        const title = extractBookTitle(doc);
        if (!title) return;

        const container = findActionContainer(doc);
        if (!container) return;

        const existingButton = doc.getElementById(BUTTON_ID);
        if (existingButton) {
            existingButton.href = buildAmazonSearchUrl(title);
            existingButton.textContent = buildButtonLabel(title);
            return;
        }

        const button = createButton(doc, title);
        container.appendChild(button);
    }

    function scheduleRender() {
        if (renderScheduled || typeof window === 'undefined') return;
        renderScheduled = true;

        window.requestAnimationFrame(() => {
            renderScheduled = false;
            renderButton(document);
        });
    }

    function initObserver() {
        if (observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;

        observer = new MutationObserver(() => {
            scheduleRender();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        if (typeof document === 'undefined') return;

        injectStyles(document);
        renderButton(document);
        initObserver();
    }

    const api = {
        normalizeWhitespace,
        extractBookTitle,
        buildAmazonSearchUrl,
        buildButtonLabel
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    }
})();
