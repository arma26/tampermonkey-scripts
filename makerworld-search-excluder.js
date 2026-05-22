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

    const EXCLUDE_URL_PARAM_NAME = 'tmExclude';
    const INCLUDE_URL_PARAM_NAME = 'tmInclude';
    const STYLE_ID = 'tm-makerworld-search-excluder-style';
    const CONTROLS_ID = 'tm-makerworld-search-excluder-controls';
    const INCLUDE_SECTION_ID = 'tm-makerworld-search-includer-section';
    const EXCLUDE_SECTION_ID = 'tm-makerworld-search-excluder-section';
    const INCLUDE_TAGS_ID = 'tm-makerworld-search-includer-tags';
    const EXCLUDE_TAGS_ID = 'tm-makerworld-search-excluder-tags';
    const INCLUDE_BUTTON_ID = 'tm-makerworld-search-includer-button';
    const EXCLUDE_BUTTON_ID = 'tm-makerworld-search-excluder-button';
    const TOGGLE_ID = 'tm-makerworld-search-excluder-toggle';
    const INCLUDE_CLEAR_ID = 'tm-makerworld-search-includer-clear';
    const EXCLUDE_CLEAR_ID = 'tm-makerworld-search-excluder-clear';
    const PLACEHOLDER_CLASS = 'tm-makerworld-search-excluder-placeholder';
    const SEARCH_CONTAINER_SELECTOR = '.search-input-container';
    const RESULT_CARD_SELECTOR = '.card-wrapper';
    const RESULT_TITLE_SELECTOR = '.translated-text a';
    const PAGINATION_LINK_SELECTOR = 'a[href*="/search/"][href*="page="]';
    const OBSERVER_DEBOUNCE_MS = 100;
    const PLACEHOLDER_TEXT = 'Hidden by current filter';

    let includedKeywords = [];
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

    function removeKeywordFromList(existingKeywords, keywordToRemove) {
        const normalizedTarget = normalizeKeyword(keywordToRemove);
        return normalizeKeywords(existingKeywords).filter(keyword => keyword !== normalizedTarget);
    }

    function findKeywordRemoveChip(target) {
        if (target && typeof target.closest === 'function') {
            return target.closest('[data-keyword][data-keyword-type]');
        }

        if (target?.parentElement && typeof target.parentElement.closest === 'function') {
            return target.parentElement.closest('[data-keyword][data-keyword-type]');
        }

        return null;
    }

    function readKeywordsFromUrl(url, paramName) {
        const parsedUrl = new URL(url, globalThis.location?.origin || 'https://makerworld.com');
        return normalizeKeywords(parsedUrl.searchParams.get(paramName) || '');
    }

    function readExcludedKeywordsFromUrl(url) {
        return readKeywordsFromUrl(url, EXCLUDE_URL_PARAM_NAME);
    }

    function readIncludedKeywordsFromUrl(url) {
        return readKeywordsFromUrl(url, INCLUDE_URL_PARAM_NAME);
    }

    function writeKeywordsToUrl(url, keywords, paramName) {
        const parsedUrl = new URL(url, globalThis.location?.origin || 'https://makerworld.com');
        const normalized = normalizeKeywords(keywords);

        if (normalized.length > 0) {
            parsedUrl.searchParams.set(paramName, normalized.join(','));
        } else {
            parsedUrl.searchParams.delete(paramName);
        }

        return parsedUrl.toString();
    }

    function writeExcludedKeywordsToUrl(url, keywords) {
        return writeKeywordsToUrl(url, keywords, EXCLUDE_URL_PARAM_NAME);
    }

    function writeIncludedKeywordsToUrl(url, keywords) {
        return writeKeywordsToUrl(url, keywords, INCLUDE_URL_PARAM_NAME);
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

    function titleMatchesIncludedKeywords(title, keywords) {
        const normalizedTitle = normalizeFilterToken(title);
        const normalizedKeywords = normalizeKeywords(keywords)
            .map(normalizeFilterToken)
            .filter(Boolean);

        if (normalizedKeywords.length === 0) return true;
        if (!normalizedTitle) return false;

        return normalizedKeywords.every(keyword => normalizedTitle.includes(keyword));
    }

    function updatePaginationUrl(href, includedKeywordsToWrite, excludedKeywordsToWrite, baseUrl) {
        if (!href) return '';
        const nextUrl = writeIncludedKeywordsToUrl(
            new URL(href, baseUrl).toString(),
            includedKeywordsToWrite
        );
        return writeExcludedKeywordsToUrl(nextUrl, excludedKeywordsToWrite);
    }

    function shouldFilterTitle(title, includedKeywordsToCheck, excludedKeywordsToCheck, isFilterEnabled) {
        if (!isFilterEnabled) return false;
        if (!titleMatchesIncludedKeywords(title, includedKeywordsToCheck)) return true;
        return titleMatchesExcludedKeyword(title, excludedKeywordsToCheck);
    }

    function shouldReplaceCardWithPlaceholder(title, keywords, isFilterEnabled) {
        return shouldFilterTitle(title, [], keywords, isFilterEnabled);
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

            #${INCLUDE_BUTTON_ID},
            #${EXCLUDE_BUTTON_ID},
            #${TOGGLE_ID},
            #${INCLUDE_CLEAR_ID},
            #${EXCLUDE_CLEAR_ID} {
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

            #${INCLUDE_BUTTON_ID}:hover,
            #${EXCLUDE_BUTTON_ID}:hover,
            #${TOGGLE_ID}:hover,
            #${INCLUDE_CLEAR_ID}:hover,
            #${EXCLUDE_CLEAR_ID}:hover {
                background: #f5f5f5;
            }

            #${TOGGLE_ID}[data-enabled="true"] {
                background: #edf8e7;
                border-color: rgba(57, 170, 0, 0.35);
                color: #1f4d0f;
            }

            #${INCLUDE_SECTION_ID},
            #${EXCLUDE_SECTION_ID} {
                display: flex;
                align-items: flex-start;
                align-content: flex-start;
                flex-wrap: wrap;
                gap: 8px;
                min-width: 0;
                flex: 1 1 220px;
            }

            #${INCLUDE_TAGS_ID},
            #${EXCLUDE_TAGS_ID} {
                display: flex;
                align-items: flex-start;
                align-content: flex-start;
                flex-wrap: wrap;
                gap: 8px;
                min-width: 0;
                flex: 1 1 220px;
            }

            .tm-makerworld-search-excluder-tag {
                border: 0;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                border-radius: 999px;
                background: #edf8e7;
                color: #1f4d0f;
                cursor: pointer;
                font: inherit;
                font-size: 12px;
                line-height: 1;
                padding: 7px 10px;
                user-select: none;
            }

            .tm-makerworld-search-excluder-tag:hover {
                background: #dff0d4;
            }

            .tm-makerworld-search-excluder-tag .tm-makerworld-search-excluder-tag__close {
                color: inherit;
                font-size: 14px;
                line-height: 1;
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
        const withIncludes = writeIncludedKeywordsToUrl(globalThis.location.href, includedKeywords);
        const nextUrl = writeExcludedKeywordsToUrl(withIncludes, excludedKeywords);
        if (nextUrl === lastUrl) return;

        globalThis.history.replaceState(globalThis.history.state, '', nextUrl);
        lastUrl = nextUrl;
    }

    function removeKeyword(keywordToRemove, keywordType) {
        if (keywordType === 'include') {
            includedKeywords = removeKeywordFromList(includedKeywords, keywordToRemove);
        } else {
            excludedKeywords = removeKeywordFromList(excludedKeywords, keywordToRemove);
        }
        syncUiAndFiltering();
    }

    function renderTags(tagsRoot, keywords, keywordType) {
        const fragment = document.createDocumentFragment();

        for (const keyword of keywords) {
            const tag = document.createElement('button');
            tag.className = 'tm-makerworld-search-excluder-tag';
            tag.type = 'button';
            tag.dataset.keyword = keyword;
            tag.dataset.keywordType = keywordType;
            tag.setAttribute('aria-label', `Remove ${keywordType} keyword ${keyword}`);
            tag.innerHTML = `
                <span>${keyword}</span>
                <span class="tm-makerworld-search-excluder-tag__close" aria-hidden="true">×</span>
            `;
            tag.addEventListener('pointerdown', event => {
                event.preventDefault();
                event.stopPropagation();
                removeKeyword(keyword, keywordType);
            });
            tag.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
            });
            fragment.appendChild(tag);
        }

        tagsRoot.replaceChildren(fragment);
    }

    function handleAddExcludedKeywords() {
        const response = globalThis.prompt(
            'Add title keywords to exclude. Separate multiple values with commas or new lines.',
            ''
        );
        if (response === null) return;

        excludedKeywords = mergeExcludedKeywords(excludedKeywords, response);
        syncUiAndFiltering();
    }

    function handleAddIncludedKeywords() {
        const response = globalThis.prompt(
            'Add title keywords to include. Titles must match all include keywords. Separate values with commas or new lines.',
            ''
        );
        if (response === null) return;

        includedKeywords = mergeExcludedKeywords(includedKeywords, response);
        syncUiAndFiltering();
    }

    function clearExcludedKeywords() {
        excludedKeywords = [];
        syncUiAndFiltering();
    }

    function clearIncludedKeywords() {
        includedKeywords = [];
        syncUiAndFiltering();
    }

    function ensureControls() {
        const searchContainer = getSearchContainer();
        if (!searchContainer || !searchContainer.parentElement) return;

        let controls = document.getElementById(CONTROLS_ID);
        if (!controls) {
            controls = document.createElement('div');
            controls.id = CONTROLS_ID;

            const includeSection = document.createElement('div');
            includeSection.id = INCLUDE_SECTION_ID;

            const includeButton = document.createElement('button');
            includeButton.id = INCLUDE_BUTTON_ID;
            includeButton.type = 'button';
            includeButton.textContent = 'Include';
            includeButton.addEventListener('click', handleAddIncludedKeywords);

            const includeClearButton = document.createElement('button');
            includeClearButton.id = INCLUDE_CLEAR_ID;
            includeClearButton.type = 'button';
            includeClearButton.textContent = 'Clear Include';
            includeClearButton.addEventListener('click', clearIncludedKeywords);

            const includeTags = document.createElement('div');
            includeTags.id = INCLUDE_TAGS_ID;

            includeSection.appendChild(includeButton);
            includeSection.appendChild(includeClearButton);
            includeSection.appendChild(includeTags);

            const excludeSection = document.createElement('div');
            excludeSection.id = EXCLUDE_SECTION_ID;

            const excludeButton = document.createElement('button');
            excludeButton.id = EXCLUDE_BUTTON_ID;
            excludeButton.type = 'button';
            excludeButton.textContent = 'Exclude';
            excludeButton.addEventListener('click', handleAddExcludedKeywords);

            const toggle = document.createElement('button');
            toggle.id = TOGGLE_ID;
            toggle.type = 'button';
            toggle.addEventListener('click', () => {
                filterEnabled = !filterEnabled;
                syncUiAndFiltering();
            });

            const excludeClearButton = document.createElement('button');
            excludeClearButton.id = EXCLUDE_CLEAR_ID;
            excludeClearButton.type = 'button';
            excludeClearButton.textContent = 'Clear Exclude';
            excludeClearButton.addEventListener('click', clearExcludedKeywords);

            const excludeTags = document.createElement('div');
            excludeTags.id = EXCLUDE_TAGS_ID;

            excludeSection.appendChild(excludeButton);
            excludeSection.appendChild(excludeClearButton);
            excludeSection.appendChild(excludeTags);

            controls.appendChild(includeSection);
            controls.appendChild(excludeSection);
            controls.appendChild(toggle);
        }

        if (controls.parentElement !== searchContainer.parentElement) {
            searchContainer.parentElement.insertBefore(controls, searchContainer.nextSibling);
        }

        const toggle = controls.querySelector(`#${TOGGLE_ID}`);
        if (toggle) {
            toggle.textContent = getFilterToggleLabel(filterEnabled);
            toggle.dataset.enabled = String(filterEnabled);
        }

        const includeTagsRoot = controls.querySelector(`#${INCLUDE_TAGS_ID}`);
        if (includeTagsRoot) {
            renderTags(includeTagsRoot, includedKeywords, 'include');
        }

        const excludeTagsRoot = controls.querySelector(`#${EXCLUDE_TAGS_ID}`);
        if (excludeTagsRoot) {
            renderTags(excludeTagsRoot, excludedKeywords, 'exclude');
        }
    }

    function filterResults() {
        for (const card of getResultsCards()) {
            const title = getCardTitle(card);
            const shouldReplace = shouldFilterTitle(title, includedKeywords, excludedKeywords, filterEnabled);

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
            link.href = updatePaginationUrl(
                href,
                includedKeywords,
                excludedKeywords,
                globalThis.location.href
            );
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

        includedKeywords = readIncludedKeywordsFromUrl(currentUrl);
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
        removeKeywordFromList,
        findKeywordRemoveChip,
        readExcludedKeywordsFromUrl,
        readIncludedKeywordsFromUrl,
        writeExcludedKeywordsToUrl,
        writeIncludedKeywordsToUrl,
        titleMatchesExcludedKeyword,
        titleMatchesIncludedKeywords,
        updatePaginationUrl,
        shouldFilterTitle,
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
