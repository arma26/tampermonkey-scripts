// ==UserScript==
// @name         MakerWorld Search Excluder
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Exclude MakerWorld search results by title keywords
// @match        https://makerworld.com/*/search/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const URL_PARAM_NAME = 'tmExclude';
    const STYLE_ID = 'tm-makerworld-search-excluder-style';
    const CONTROLS_ID = 'tm-makerworld-search-excluder-controls';
    const TAGS_ID = 'tm-makerworld-search-excluder-tags';
    const BUTTON_ID = 'tm-makerworld-search-excluder-button';
    const TOGGLE_ID = 'tm-makerworld-search-excluder-toggle';
    const CLEAR_ID = 'tm-makerworld-search-excluder-clear';
    const PLACEHOLDER_CLASS = 'tm-makerworld-search-excluder-placeholder';
    const SEARCH_CONTAINER_SELECTOR = '.search-input-container';
    const RESULT_CARD_SELECTOR = '.card-wrapper';
    const RESULT_TITLE_SELECTOR = '.translated-text a';
    const PAGINATION_LINK_SELECTOR = 'a[href*="/search/"][href*="page="]';
    const OBSERVER_DEBOUNCE_MS = 100;
    const PLACEHOLDER_TEXT = 'Hidden by exclusion filter';

    let excludedKeywords = [];
    let filterEnabled = true;
    let observer = null;
    let renderTimer = null;
    let lastUrl = '';

    function normalizeKeyword(value) {
        return String(value || '').trim().toLowerCase();
    }

    function normalizeFilterToken(value) {
        return normalizeKeyword(value).replace(/[^a-z0-9]+/g, '');
    }

    function normalizeKeywords(value) {
        const rawValues = Array.isArray(value)
            ? value
            : String(value || '').split(/[\n,]+/);
        const deduped = [];
        const seen = new Set();

        for (const rawValue of rawValues) {
            const keyword = normalizeKeyword(rawValue);
            if (!keyword || seen.has(keyword)) continue;
            seen.add(keyword);
            deduped.push(keyword);
        }

        return deduped;
    }

    function mergeExcludedKeywords(existingKeywords, nextKeywords) {
        return normalizeKeywords([
            ...normalizeKeywords(existingKeywords),
            ...normalizeKeywords(nextKeywords)
        ]);
    }

    function readExcludedKeywordsFromUrl(url) {
        const parsedUrl = new URL(url, globalThis.location?.origin || 'https://makerworld.com');
        return normalizeKeywords(parsedUrl.searchParams.get(URL_PARAM_NAME) || '');
    }

    function writeExcludedKeywordsToUrl(url, keywords) {
        const parsedUrl = new URL(url, globalThis.location?.origin || 'https://makerworld.com');
        const normalized = normalizeKeywords(keywords);

        if (normalized.length > 0) {
            parsedUrl.searchParams.set(URL_PARAM_NAME, normalized.join(','));
        } else {
            parsedUrl.searchParams.delete(URL_PARAM_NAME);
        }

        return parsedUrl.toString();
    }

    function titleMatchesExcludedKeyword(title, keywords) {
        const normalizedTitle = normalizeFilterToken(title);
        if (!normalizedTitle) return false;

        for (const keyword of normalizeKeywords(keywords)) {
            const normalizedKeyword = normalizeFilterToken(keyword);
            if (normalizedKeyword && normalizedTitle.includes(normalizedKeyword)) {
                return true;
            }
        }

        return false;
    }

    function updatePaginationUrl(href, keywords, baseUrl) {
        if (!href) return '';
        return writeExcludedKeywordsToUrl(new URL(href, baseUrl).toString(), keywords);
    }

    function shouldReplaceCardWithPlaceholder(title, keywords, isFilterEnabled) {
        return Boolean(isFilterEnabled) && titleMatchesExcludedKeyword(title, keywords);
    }

    function getFilterToggleLabel(isFilterEnabled) {
        return isFilterEnabled ? 'Filter on' : 'Filter off';
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .search-input-container {
                flex: 1 1 320px;
                min-width: 240px;
            }

            #${CONTROLS_ID} {
                display: flex;
                align-items: flex-start;
                align-content: flex-start;
                flex-wrap: wrap;
                gap: 8px;
                margin-left: 12px;
                flex: 0 1 480px;
                min-width: 0;
                justify-content: flex-start;
            }

            #${BUTTON_ID},
            #${TOGGLE_ID},
            #${CLEAR_ID} {
                border: 1px solid rgba(0, 0, 0, 0.14);
                border-radius: 999px;
                background: #ffffff;
                color: #222222;
                cursor: pointer;
                font: inherit;
                font-size: 13px;
                font-weight: 600;
                line-height: 1;
                padding: 8px 12px;
                white-space: nowrap;
            }

            #${BUTTON_ID}:hover,
            #${TOGGLE_ID}:hover,
            #${CLEAR_ID}:hover {
                background: #f5f5f5;
            }

            #${TOGGLE_ID}[data-enabled="true"] {
                background: #edf8e7;
                border-color: rgba(57, 170, 0, 0.35);
                color: #1f4d0f;
            }

            #${TAGS_ID} {
                display: flex;
                align-items: flex-start;
                align-content: flex-start;
                flex-wrap: wrap;
                gap: 8px;
                min-width: 0;
                flex: 1 1 220px;
            }

            .tm-makerworld-search-excluder-tag {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border-radius: 999px;
                background: #edf8e7;
                color: #1f4d0f;
                font-size: 12px;
                line-height: 1;
                padding: 7px 10px;
            }

            .tm-makerworld-search-excluder-tag button {
                border: 0;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font: inherit;
                font-size: 14px;
                line-height: 1;
                padding: 0;
            }

            .${PLACEHOLDER_CLASS} {
                min-height: 100%;
            }

            .${PLACEHOLDER_CLASS} .tm-makerworld-search-excluder-placeholder__box {
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 240px;
                border: 1px dashed rgba(0, 0, 0, 0.14);
                border-radius: 16px;
                background: rgba(0, 0, 0, 0.02);
                color: rgba(0, 0, 0, 0.52);
                font-size: 13px;
                line-height: 1.4;
                padding: 20px;
                text-align: center;
            }
        `;

        document.head.appendChild(style);
    }

    function getSearchContainer() {
        return document.querySelector(SEARCH_CONTAINER_SELECTOR);
    }

    function getResultsCards() {
        return Array.from(document.querySelectorAll(RESULT_CARD_SELECTOR));
    }

    function getCardTitle(card) {
        return card.querySelector(RESULT_TITLE_SELECTOR)?.textContent || '';
    }

    function getPlaceholderId(card) {
        const title = normalizeKeyword(getCardTitle(card)) || 'untitled';
        return `tm-makerworld-search-excluder-placeholder-${title.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    }

    function getExistingPlaceholder(card) {
        return card.parentElement?.querySelector(`[data-placeholder-for="${getPlaceholderId(card)}"]`) || null;
    }

    function buildPlaceholder(card) {
        const placeholder = document.createElement('div');
        placeholder.className = `${card.className} ${PLACEHOLDER_CLASS}`;
        placeholder.dataset.placeholderFor = getPlaceholderId(card);
        placeholder.innerHTML = `
            <div class="tm-makerworld-search-excluder-placeholder__box">${PLACEHOLDER_TEXT}</div>
        `;
        return placeholder;
    }

    function showCard(card) {
        card.style.display = '';
        const placeholder = getExistingPlaceholder(card);
        if (placeholder) {
            placeholder.remove();
        }
    }

    function applyCurrentUrl() {
        const nextUrl = writeExcludedKeywordsToUrl(globalThis.location.href, excludedKeywords);
        if (nextUrl === lastUrl) return;

        globalThis.history.replaceState(globalThis.history.state, '', nextUrl);
        lastUrl = nextUrl;
    }

    function removeKeyword(keywordToRemove) {
        excludedKeywords = excludedKeywords.filter(keyword => keyword !== keywordToRemove);
        syncUiAndFiltering();
    }

    function renderTags(tagsRoot) {
        const fragment = document.createDocumentFragment();

        for (const keyword of excludedKeywords) {
            const tag = document.createElement('span');
            tag.className = 'tm-makerworld-search-excluder-tag';
            tag.textContent = keyword;

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.setAttribute('aria-label', `Remove excluded keyword ${keyword}`);
            removeButton.textContent = '×';
            removeButton.addEventListener('click', () => {
                removeKeyword(keyword);
            });

            tag.appendChild(removeButton);
            fragment.appendChild(tag);
        }

        tagsRoot.replaceChildren(fragment);
    }

    function handleAddKeywords() {
        const response = globalThis.prompt(
            'Add title keywords to exclude. Separate multiple values with commas or new lines.',
            ''
        );
        if (response === null) return;

        excludedKeywords = mergeExcludedKeywords(excludedKeywords, response);
        syncUiAndFiltering();
    }

    function clearKeywords() {
        excludedKeywords = [];
        syncUiAndFiltering();
    }

    function ensureControls() {
        const searchContainer = getSearchContainer();
        if (!searchContainer || !searchContainer.parentElement) return;

        let controls = document.getElementById(CONTROLS_ID);
        if (!controls) {
            controls = document.createElement('div');
            controls.id = CONTROLS_ID;

            const button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.textContent = 'Exclude';
            button.addEventListener('click', handleAddKeywords);

            const toggle = document.createElement('button');
            toggle.id = TOGGLE_ID;
            toggle.type = 'button';
            toggle.addEventListener('click', () => {
                filterEnabled = !filterEnabled;
                syncUiAndFiltering();
            });

            const clearButton = document.createElement('button');
            clearButton.id = CLEAR_ID;
            clearButton.type = 'button';
            clearButton.textContent = 'Clear';
            clearButton.addEventListener('click', clearKeywords);

            const tags = document.createElement('div');
            tags.id = TAGS_ID;

            controls.appendChild(button);
            controls.appendChild(toggle);
            controls.appendChild(clearButton);
            controls.appendChild(tags);
        }

        if (controls.parentElement !== searchContainer.parentElement) {
            searchContainer.parentElement.insertBefore(controls, searchContainer.nextSibling);
        }

        const toggle = controls.querySelector(`#${TOGGLE_ID}`);
        if (toggle) {
            toggle.textContent = getFilterToggleLabel(filterEnabled);
            toggle.dataset.enabled = String(filterEnabled);
        }

        const tagsRoot = controls.querySelector(`#${TAGS_ID}`);
        if (tagsRoot) {
            renderTags(tagsRoot);
        }
    }

    function filterResults() {
        for (const card of getResultsCards()) {
            const title = getCardTitle(card);
            const shouldReplace = shouldReplaceCardWithPlaceholder(title, excludedKeywords, filterEnabled);

            if (!shouldReplace) {
                showCard(card);
                continue;
            }

            let placeholder = getExistingPlaceholder(card);
            if (!placeholder) {
                placeholder = buildPlaceholder(card);
                card.insertAdjacentElement('afterend', placeholder);
            }

            card.style.display = 'none';
        }
    }

    function rewritePaginationLinks() {
        for (const link of document.querySelectorAll(PAGINATION_LINK_SELECTOR)) {
            const href = link.getAttribute('href');
            if (!href) continue;
            link.href = updatePaginationUrl(href, excludedKeywords, globalThis.location.href);
        }
    }

    function syncUiAndFiltering() {
        ensureControls();
        filterResults();
        rewritePaginationLinks();
        applyCurrentUrl();
    }

    function scheduleSync() {
        if (renderTimer !== null) {
            globalThis.clearTimeout(renderTimer);
        }

        renderTimer = globalThis.setTimeout(() => {
            renderTimer = null;
            handleUrlChange();
            syncUiAndFiltering();
        }, OBSERVER_DEBOUNCE_MS);
    }

    function handleUrlChange() {
        const currentUrl = globalThis.location.href;
        if (currentUrl === lastUrl) return;

        excludedKeywords = readExcludedKeywordsFromUrl(currentUrl);
        lastUrl = currentUrl;
    }

    function initObserver() {
        if (observer) return;

        observer = new MutationObserver(() => {
            scheduleSync();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        if (typeof document === 'undefined') return;

        injectStyles();
        handleUrlChange();
        syncUiAndFiltering();
        initObserver();
        globalThis.addEventListener('popstate', scheduleSync);
    }

    const api = {
        normalizeKeyword,
        normalizeFilterToken,
        normalizeKeywords,
        mergeExcludedKeywords,
        readExcludedKeywordsFromUrl,
        writeExcludedKeywordsToUrl,
        titleMatchesExcludedKeyword,
        updatePaginationUrl,
        shouldReplaceCardWithPlaceholder,
        getFilterToggleLabel
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
