// ==UserScript==
// @name         HF Price Tracker Tools
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Add table and link tools for hfpricetracker.com
// @match        https://hfpricetracker.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONTAINER_SELECTOR = '.products';
    const CARD_SELECTOR = '.product';
    const TABLE_ID = 'hfpt-table-view';
    const TOGGLE_ID = 'hfpt-toggle-view';
    const STYLE_ID = 'hfpt-table-style';
    const PRODUCT_CONTAINER_SELECTOR = '.product-container';
    const PRICE_HISTORY_SELECTOR = '.product-container > .price-history';
    const COUPON_HISTORY_SELECTOR = '.coupon-history';
    const COUPON_SECTION_ID = 'hfpt-coupon-section';
    const COUPON_SIDEBAR_ID = 'hfpt-product-sidebar';
    const COUPON_TOGGLE_ID = 'hfpt-expired-coupons-toggle';
    const COUPON_EMPTY_ID = 'hfpt-no-active-coupons';
    const STORAGE_KEY = 'hfpt-view-mode';
    const EXPIRED_COUPONS_STORAGE_KEY = 'hfpt-show-expired-coupons';
    const DEFAULT_MODE = 'table';
    const MATCHES_LOWEST_CLASS = 'hfpt-matches-lowest';
    const HARBOR_FREIGHT_SEARCH_URL = 'https://www.harborfreight.com/search?q=';
    const TRACKER_RELATIVE_TOOL_PATH = '/tools/';
    const DEFAULT_SORT_STATE = {
        column: null,
        direction: null
    };
    const SORT_DIRECTIONS = {
        asc: 'desc',
        desc: 'asc'
    };
    const SORT_DEFAULT_DIRECTIONS = {
        brand: 'asc',
        sku: 'asc',
        change: 'desc',
        product: 'asc',
        current: 'desc',
        lowest: 'desc'
    };
    const COLUMN_DEFINITIONS = [
        { label: 'Brand', key: 'brand', type: 'text', sortable: true, cellClass: 'hfpt-brand-cell', valueKey: 'brandText' },
        { label: 'Product', key: 'product', type: 'text', sortable: true, cellClass: 'hfpt-product-cell', valueKey: 'productName' },
        { label: 'SKU', key: 'sku', type: 'text', sortable: true, cellClass: 'hfpt-sku-cell', valueKey: 'skuText' },
        { label: 'Current', key: 'current', type: 'number', sortable: true, cellClass: 'hfpt-price-cell', valueKey: 'currentPriceValue' },
        { label: 'Change', key: 'change', type: 'number', sortable: true, cellClass: 'hfpt-change-cell', valueKey: 'changeValue' },
        { label: 'Lowest', key: 'lowest', type: 'number', sortable: true, cellClass: 'hfpt-price-cell', valueKey: 'lowestPriceValue' },
        { label: 'Tracker', key: 'tracker', type: 'text', sortable: false, cellClass: 'hfpt-tracker-cell', valueKey: 'trackerHref' },
        { label: 'HF', key: 'hf', type: 'text', sortable: false, cellClass: 'hfpt-hf-cell', valueKey: 'hfSearchHref' }
    ];

    let observer = null;
    let renderScheduled = false;
    let sortState = getDefaultSortState();

    function getViewMode() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE;
    }

    function setViewMode(mode) {
        localStorage.setItem(STORAGE_KEY, mode);
    }

    function getShowExpiredCoupons() {
        return localStorage.getItem(EXPIRED_COUPONS_STORAGE_KEY) === 'true';
    }

    function setShowExpiredCoupons(value) {
        localStorage.setItem(EXPIRED_COUPONS_STORAGE_KEY, value ? 'true' : 'false');
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${TOGGLE_ID} {
                margin: 12px 0;
                padding: 8px 12px;
                border: 1px solid #c7ccd4;
                border-radius: 6px;
                background: #fff;
                color: #222;
                cursor: pointer;
                font: inherit;
            }

            #${TABLE_ID} {
                width: 100%;
                min-width: 100%;
                border-collapse: collapse;
                margin-bottom: 16px;
                background: #fff;
            }

            #${TABLE_ID} th,
            #${TABLE_ID} td {
                padding: 10px 12px;
                border-bottom: 1px solid #e1e5ea;
                text-align: left;
                vertical-align: top;
            }

            #${TABLE_ID} th {
                position: sticky;
                top: 0;
                z-index: 1;
                background: #f5f7fa;
                white-space: nowrap;
            }

            #${TABLE_ID} th button {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 0;
                border: 0;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font: inherit;
                font-weight: 700;
            }

            #${TABLE_ID} th button::after {
                content: '';
                font-size: 0.85em;
                color: #738091;
            }

            #${TABLE_ID} th button[data-sort-direction="asc"]::after {
                content: '▲';
            }

            #${TABLE_ID} th button[data-sort-direction="desc"]::after {
                content: '▼';
            }

            #${TABLE_ID} th button.hfpt-sortable {
                text-decoration: underline;
                text-underline-offset: 0.15em;
            }

            #${TABLE_ID} tbody tr:hover {
                background: #f8fafc;
            }

            #${TABLE_ID} tbody tr.${MATCHES_LOWEST_CLASS} {
                background: #e8f3ff;
            }

            #${TABLE_ID} tbody tr.${MATCHES_LOWEST_CLASS}:hover {
                background: #dcecff;
            }

            #${TABLE_ID} td.hfpt-product-cell a,
            #${TABLE_ID} td.hfpt-brand-cell a {
                color: inherit;
                text-decoration: none;
            }

            #${TABLE_ID} td.hfpt-product-cell a:hover,
            #${TABLE_ID} td.hfpt-brand-cell a:hover {
                text-decoration: underline;
            }

            #${TABLE_ID} td.hfpt-product-cell {
                min-width: 320px;
            }

            #${TABLE_ID} td.hfpt-price-cell,
            #${TABLE_ID} td.hfpt-change-cell,
            #${TABLE_ID} td.hfpt-sku-cell,
            #${TABLE_ID} td.hfpt-hf-cell,
            #${TABLE_ID} td.hfpt-tracker-cell {
                white-space: nowrap;
            }

            .hfpt-hidden {
                display: none !important;
            }

            #${COUPON_SIDEBAR_ID} {
                display: flex;
                flex: 1 1 420px;
                flex-direction: column;
                gap: 16px;
                width: 100%;
                max-width: 520px;
                min-width: 320px;
                align-self: flex-start;
            }

            #${COUPON_SIDEBAR_ID} > .product,
            #${COUPON_SIDEBAR_ID} > .product .brandLink,
            #${COUPON_SIDEBAR_ID} > .product .productLink {
                display: block;
                width: 100% !important;
                max-width: none !important;
                box-sizing: border-box;
            }

            #${COUPON_SIDEBAR_ID} > .product .productLink {
                display: flex;
                flex-direction: column;
                align-items: stretch;
            }

            #${COUPON_SIDEBAR_ID} > .product .productLink > p,
            #${COUPON_SIDEBAR_ID} > .product .productLink > div {
                width: 100% !important;
                max-width: none !important;
                box-sizing: border-box;
            }

            #${COUPON_SIDEBAR_ID} > .product .image {
                display: block;
                width: auto !important;
                max-width: 100%;
                height: auto;
                align-self: center;
            }

            #${COUPON_SIDEBAR_ID} > .product .product-name {
                max-width: none !important;
            }

            ${PRODUCT_CONTAINER_SELECTOR} {
                align-items: flex-start;
                gap: 16px;
            }

            ${PRICE_HISTORY_SELECTOR} {
                flex: 2 1 0;
                min-width: 0;
            }

            #${COUPON_SECTION_ID} {
                width: 100%;
            }

            #${COUPON_SECTION_ID} .hfpt-coupon-header {
                display: flex;
                align-items: baseline;
                gap: 8px;
                margin-bottom: 12px;
                flex-wrap: wrap;
            }

            #${COUPON_SECTION_ID} h2 {
                margin: 0;
            }

            #${COUPON_TOGGLE_ID} {
                padding: 0;
                border: 0;
                background: transparent;
                color: inherit;
                cursor: pointer;
                font: inherit;
                text-decoration: underline;
            }

            #${COUPON_SECTION_ID} .coupon-history ul {
                margin: 0;
                padding-left: 18px;
            }

            #${COUPON_EMPTY_ID} {
                margin: 0;
                color: #666;
            }

            @media (max-width: 900px) {
                ${PRODUCT_CONTAINER_SELECTOR} {
                    display: flex;
                    flex-direction: column;
                }

                ${PRICE_HISTORY_SELECTOR} {
                    width: 100%;
                }

                #${COUPON_SIDEBAR_ID} {
                    order: -1;
                    width: 100%;
                    max-width: none;
                    flex-basis: auto;
                }

                #${TABLE_ID} td.hfpt-product-cell {
                    min-width: 220px;
                }
            }
        `;

        document.head.appendChild(style);
    }

    function parsePriceSummary(text) {
        const normalized = text.replace(/\s+/g, ' ').trim();
        const currentMatch = normalized.match(/Current:\s*([^ ]+)/i);
        const lowestMatch = normalized.match(/Lowest:\s*([^ ]+)/i);

        return {
            current: currentMatch ? currentMatch[1] : '',
            lowest: lowestMatch ? lowestMatch[1] : ''
        };
    }

    function parsePriceValue(text) {
        const normalized = String(text || '').replace(/[^0-9.-]/g, '');
        if (!normalized) return null;

        const value = Number.parseFloat(normalized);
        return Number.isFinite(value) ? value : null;
    }

    function parseChangePercentValue(text) {
        const normalized = String(text || '').trim();
        if (!normalized) return null;

        const match = normalized.match(/(-?\d+(?:\.\d+)?)\s*%/);
        if (!match) return null;

        const value = Number.parseFloat(match[1]);
        if (!Number.isFinite(value)) return null;
        if (normalized.includes('↓')) return -value;
        return value;
    }

    function getDefaultSortState() {
        return { ...DEFAULT_SORT_STATE };
    }

    function getNextSortState(currentSortState, columnKey) {
        if (!columnKey || !SORT_DEFAULT_DIRECTIONS[columnKey]) {
            return getDefaultSortState();
        }

        if (currentSortState.column === columnKey && currentSortState.direction) {
            return {
                column: columnKey,
                direction: SORT_DIRECTIONS[currentSortState.direction] || SORT_DEFAULT_DIRECTIONS[columnKey]
            };
        }

        return {
            column: columnKey,
            direction: SORT_DEFAULT_DIRECTIONS[columnKey]
        };
    }

    function compareText(left, right) {
        return String(left || '').localeCompare(String(right || ''), undefined, {
            sensitivity: 'base',
            numeric: true
        });
    }

    function compareNullableValues(left, right, comparator) {
        const leftMissing = left === null || left === undefined || left === '';
        const rightMissing = right === null || right === undefined || right === '';
        if (leftMissing && rightMissing) return 0;
        if (leftMissing) return 1;
        if (rightMissing) return -1;
        return comparator(left, right);
    }

    function sortProductData(rows, currentSortState) {
        const rowsCopy = rows.slice();
        if (!currentSortState?.column || !currentSortState?.direction) {
            return rowsCopy.sort((left, right) => left.originalIndex - right.originalIndex);
        }

        const columnDefinition = COLUMN_DEFINITIONS.find(column => column.key === currentSortState.column);
        if (!columnDefinition || !columnDefinition.sortable) {
            return rowsCopy.sort((left, right) => left.originalIndex - right.originalIndex);
        }

        const directionMultiplier = currentSortState.direction === 'desc' ? -1 : 1;
        const comparator = columnDefinition.type === 'number'
            ? (left, right) => left - right
            : compareText;

        return rowsCopy.sort((left, right) => {
            const leftValue = left[columnDefinition.valueKey];
            const rightValue = right[columnDefinition.valueKey];
            const leftMissing = leftValue === null || leftValue === undefined || leftValue === '';
            const rightMissing = rightValue === null || rightValue === undefined || rightValue === '';
            if (leftMissing && rightMissing) {
                return left.originalIndex - right.originalIndex;
            }
            if (leftMissing) return 1;
            if (rightMissing) return -1;

            const result = comparator(leftValue, rightValue);
            if (result !== 0) return result * directionMultiplier;
            return left.originalIndex - right.originalIndex;
        });
    }

    function getRowColor(source) {
        return window.getComputedStyle(source).color;
    }

    function getProductData(card) {
        const brandLink = card.querySelector('.brandLink');
        const productLink = card.querySelector('.productLink');
        if (!brandLink || !productLink) return null;

        const brandText = brandLink.textContent.trim();
        const skuChange = productLink.querySelector('.sku-change');
        const skuText = skuChange?.querySelector('p:first-child')?.textContent.trim() || '';
        const changeText = skuChange?.querySelector('p:last-child')?.textContent.trim() || '';
        const productName = productLink.querySelector('.product-name')?.textContent.trim() || '';
        const detailParagraphs = Array.from(productLink.querySelectorAll('p'));
        const priceText = detailParagraphs[detailParagraphs.length - 1]?.textContent.trim() || '';
        const prices = parsePriceSummary(priceText);
        const currentPriceValue = parsePriceValue(prices.current);
        const lowestPriceValue = parsePriceValue(prices.lowest);
        const trendClass = productLink.classList.contains('down')
            ? 'down'
            : productLink.classList.contains('up')
                ? 'up'
                : '';

        return {
            brandHref: brandLink.href,
            brandText,
            productHref: productLink.href,
            trackerHref: getTrackerHref(productLink.href, skuText),
            productName,
            skuText,
            changeText,
            changeValue: parseChangePercentValue(changeText),
            currentPrice: prices.current,
            currentPriceValue,
            lowestPrice: prices.lowest,
            lowestPriceValue,
            matchesLowest: prices.current && prices.current === prices.lowest,
            trendClass,
            color: getRowColor(productLink),
            hfSearchHref: getHarborFreightHref(productLink.href, skuText)
        };
    }

    function makeLink(href, text) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = text;
        return link;
    }

    function getHarborFreightSearchHref(skuText) {
        const sku = skuText.replace(/^#/, '').trim();
        return `${HARBOR_FREIGHT_SEARCH_URL}${encodeURIComponent(sku)}`;
    }

    function getTrackerHref(productHref, skuText) {
        if (productHref.includes('/tools/')) {
            return productHref;
        }

        const sku = skuText.replace(/^#/, '').trim();
        if (!sku) {
            return window.location.href;
        }

        return new URL(`${TRACKER_RELATIVE_TOOL_PATH}${encodeURIComponent(sku)}`, window.location.origin).href;
    }

    function getHarborFreightHref(_productHref, skuText) {
        return getHarborFreightSearchHref(skuText);
    }

    function appendCell(row, className, content, color) {
        const cell = document.createElement('td');
        cell.className = className;
        if (color) {
            cell.style.color = color;
        }

        if (content instanceof Node) {
            cell.appendChild(content);
        } else {
            cell.textContent = content;
        }

        row.appendChild(cell);
    }

    function buildHeaderCell(columnDefinition) {
        const th = document.createElement('th');
        if (!columnDefinition.sortable) {
            th.textContent = columnDefinition.label;
            return th;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = columnDefinition.label;
        button.className = 'hfpt-sortable';
        if (sortState.column === columnDefinition.key && sortState.direction) {
            button.dataset.sortDirection = sortState.direction;
        }
        button.addEventListener('click', () => {
            sortState = getNextSortState(sortState, columnDefinition.key);
            renderTableView();
        });
        th.appendChild(button);
        return th;
    }

    function buildTable(productRows) {
        const table = document.createElement('table');
        table.id = TABLE_ID;

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const columnDefinition of COLUMN_DEFINITIONS) {
            headerRow.appendChild(buildHeaderCell(columnDefinition));
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const data of productRows) {
            const row = document.createElement('tr');
            if (data.trendClass) {
                row.classList.add(data.trendClass);
            }
            if (data.matchesLowest) {
                row.classList.add(MATCHES_LOWEST_CLASS);
            }

            appendCell(row, 'hfpt-brand-cell', makeLink(data.brandHref, data.brandText), data.color);
            appendCell(row, 'hfpt-product-cell', makeLink(data.productHref, data.productName), data.color);
            appendCell(row, 'hfpt-sku-cell', data.skuText, data.color);
            appendCell(row, 'hfpt-price-cell', data.currentPrice, data.color);
            appendCell(row, 'hfpt-change-cell', data.changeText, data.color);
            appendCell(row, 'hfpt-price-cell', data.lowestPrice, data.color);
            appendCell(row, 'hfpt-tracker-cell', makeLink(data.trackerHref, 'Open'), data.color);
            appendCell(row, 'hfpt-hf-cell', makeLink(data.hfSearchHref, 'Open'), data.color);
            tbody.appendChild(row);
        }

        table.appendChild(tbody);
        return table;
    }

    function updateToggleLabel(button, mode) {
        button.textContent = mode === 'table' ? 'Show cards' : 'Show table';
    }

    function applyMode(container, mode) {
        const table = container.parentElement?.querySelector(`#${TABLE_ID}`);
        if (!table) return;

        if (mode === 'table') {
            container.classList.add('hfpt-hidden');
            table.classList.remove('hfpt-hidden');
        } else {
            container.classList.remove('hfpt-hidden');
            table.classList.add('hfpt-hidden');
        }

        const toggle = container.parentElement?.querySelector(`#${TOGGLE_ID}`);
        if (toggle) {
            updateToggleLabel(toggle, mode);
        }
    }

    function ensureToggle(container) {
        const parent = container.parentElement;
        if (!parent) return;

        let button = parent.querySelector(`#${TOGGLE_ID}`);
        if (!button) {
            button = document.createElement('button');
            button.id = TOGGLE_ID;
            button.type = 'button';
            button.addEventListener('click', () => {
                const currentContainer = document.querySelector(CONTAINER_SELECTOR);
                if (!currentContainer) return;

                const nextMode = getViewMode() === 'table' ? 'cards' : 'table';
                setViewMode(nextMode);
                applyMode(currentContainer, nextMode);
            });
            parent.insertBefore(button, container);
        }

        updateToggleLabel(button, getViewMode());
    }

    function renderTableView() {
        const container = document.querySelector(CONTAINER_SELECTOR);
        if (!container) return;

        const parent = container.parentElement;
        if (!parent) return;

        const cards = Array.from(container.children).filter(child => child.matches(CARD_SELECTOR));
        if (!cards.length) return;

        const existingTable = parent.querySelector(`#${TABLE_ID}`);
        if (existingTable) {
            existingTable.remove();
        }

        const productRows = cards
            .map(getProductData)
            .filter(Boolean)
            .map((data, index) => ({
                ...data,
                originalIndex: index
            }));
        const sortedRows = sortProductData(productRows, sortState);
        const table = buildTable(sortedRows);
        parent.insertBefore(table, container.nextSibling);
        ensureToggle(container);
        applyMode(container, getViewMode());
    }

    function getProductCard(productContainer) {
        return productContainer.querySelector(`#${COUPON_SIDEBAR_ID} > .product`) ||
            productContainer.querySelector(':scope > .product');
    }

    function ensureProductSidebar(productContainer, productCard, priceHistory) {
        let sidebar = productContainer.querySelector(`#${COUPON_SIDEBAR_ID}`);
        if (!sidebar) {
            sidebar = document.createElement('div');
            sidebar.id = COUPON_SIDEBAR_ID;
            productContainer.insertBefore(sidebar, priceHistory || productCard.nextSibling);
        }

        if (productCard.parentElement !== sidebar) {
            sidebar.appendChild(productCard);
        }

        return sidebar;
    }

    function hidePriceHistoryTabs(priceHistory) {
        const tabBar = priceHistory?.querySelector('.tab');
        if (tabBar) {
            tabBar.classList.add('hfpt-hidden');
        }
    }

    function updateExpiredCouponVisibility(section) {
        const showExpired = getShowExpiredCoupons();
        const toggle = section.querySelector(`#${COUPON_TOGGLE_ID}`);
        const emptyState = section.querySelector(`#${COUPON_EMPTY_ID}`);
        const items = Array.from(section.querySelectorAll('.coupon-history li'));

        let visibleItems = 0;
        for (const item of items) {
            const isExpired = Boolean(item.querySelector('.expired'));
            const shouldShow = !isExpired || showExpired;
            item.classList.toggle('hfpt-hidden', !shouldShow);
            if (shouldShow) {
                visibleItems += 1;
            }
        }

        if (toggle) {
            toggle.textContent = showExpired ? 'hide expired coupons' : 'show expired coupons';
        }

        if (emptyState) {
            emptyState.classList.toggle('hfpt-hidden', visibleItems > 0);
        }
    }

    function ensureCouponSection(sidebar, couponHistory) {
        let section = sidebar.querySelector(`#${COUPON_SECTION_ID}`);
        if (!section) {
            section = document.createElement('section');
            section.id = COUPON_SECTION_ID;

            const header = document.createElement('div');
            header.className = 'hfpt-coupon-header';

            const heading = document.createElement('h2');
            heading.textContent = 'Coupon List';

            const toggle = document.createElement('button');
            toggle.id = COUPON_TOGGLE_ID;
            toggle.type = 'button';
            toggle.addEventListener('click', () => {
                setShowExpiredCoupons(!getShowExpiredCoupons());
                updateExpiredCouponVisibility(section);
            });

            const emptyState = document.createElement('p');
            emptyState.id = COUPON_EMPTY_ID;
            emptyState.textContent = 'No active coupons.';

            header.appendChild(heading);
            header.appendChild(toggle);
            section.appendChild(header);
            section.appendChild(emptyState);
            sidebar.appendChild(section);
        }

        if (couponHistory.parentElement !== section) {
            section.appendChild(couponHistory);
        }

        updateExpiredCouponVisibility(section);
    }

    function renderProductPageTools() {
        const productContainer = document.querySelector(PRODUCT_CONTAINER_SELECTOR);
        const productCard = productContainer ? getProductCard(productContainer) : null;
        const priceHistory = document.querySelector(PRICE_HISTORY_SELECTOR);
        const couponHistory = document.querySelector(`${PRODUCT_CONTAINER_SELECTOR} ${COUPON_HISTORY_SELECTOR}`);

        if (!productContainer || !productCard || !priceHistory || !couponHistory) return;

        const sidebar = ensureProductSidebar(productContainer, productCard, priceHistory);
        hidePriceHistoryTabs(priceHistory);
        ensureCouponSection(sidebar, couponHistory);
    }

    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;

        window.requestAnimationFrame(() => {
            renderScheduled = false;
            renderTableView();
            renderProductPageTools();
        });
    }

    function initObserver() {
        if (observer) return;

        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;
                if (mutation.target instanceof Element && (
                    mutation.target.closest(CONTAINER_SELECTOR) ||
                    mutation.target.closest(PRODUCT_CONTAINER_SELECTOR)
                )) {
                    scheduleRender();
                    return;
                }

                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (
                        node.matches?.(CONTAINER_SELECTOR) ||
                        node.querySelector?.(CONTAINER_SELECTOR) ||
                        node.matches?.(PRODUCT_CONTAINER_SELECTOR) ||
                        node.querySelector?.(PRODUCT_CONTAINER_SELECTOR)
                    ) {
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
        renderTableView();
        renderProductPageTools();
        initObserver();
    }

    const api = {
        parsePriceValue,
        parseChangePercentValue,
        getDefaultSortState,
        getNextSortState,
        sortProductData
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }
})();
