// ==UserScript==
// @name         HF Price Tracker Table Toggle
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Replace deal cards with a color-preserving table and add a toggle between views
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
    const STORAGE_KEY = 'hfpt-view-mode';
    const DEFAULT_MODE = 'table';

    let observer = null;
    let renderScheduled = false;

    function getViewMode() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_MODE;
    }

    function setViewMode(mode) {
        localStorage.setItem(STORAGE_KEY, mode);
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

            #${TABLE_ID} tbody tr:hover {
                background: #f8fafc;
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
            #${TABLE_ID} td.hfpt-sku-cell {
                white-space: nowrap;
            }

            .hfpt-hidden {
                display: none !important;
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
        const trendClass = productLink.classList.contains('down')
            ? 'down'
            : productLink.classList.contains('up')
                ? 'up'
                : '';

        return {
            brandHref: brandLink.href,
            brandText,
            productHref: productLink.href,
            productName,
            skuText,
            changeText,
            currentPrice: prices.current,
            lowestPrice: prices.lowest,
            trendClass,
            color: getRowColor(productLink)
        };
    }

    function makeLink(href, text) {
        const link = document.createElement('a');
        link.href = href;
        link.textContent = text;
        return link;
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

    function buildTable(cards) {
        const table = document.createElement('table');
        table.id = TABLE_ID;

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        ['Brand', 'SKU', 'Change', 'Product', 'Current', 'Lowest'].forEach(label => {
            const th = document.createElement('th');
            th.textContent = label;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const card of cards) {
            const data = getProductData(card);
            if (!data) continue;

            const row = document.createElement('tr');
            if (data.trendClass) {
                row.classList.add(data.trendClass);
            }

            appendCell(row, 'hfpt-brand-cell', makeLink(data.brandHref, data.brandText), data.color);
            appendCell(row, 'hfpt-sku-cell', data.skuText, data.color);
            appendCell(row, 'hfpt-change-cell', data.changeText, data.color);
            appendCell(row, 'hfpt-product-cell', makeLink(data.productHref, data.productName), data.color);
            appendCell(row, 'hfpt-price-cell', data.currentPrice, data.color);
            appendCell(row, 'hfpt-price-cell', data.lowestPrice, data.color);
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

        const table = buildTable(cards);
        parent.insertBefore(table, container.nextSibling);
        ensureToggle(container);
        applyMode(container, getViewMode());
    }

    function scheduleRender() {
        if (renderScheduled) return;
        renderScheduled = true;

        window.requestAnimationFrame(() => {
            renderScheduled = false;
            renderTableView();
        });
    }

    function initObserver() {
        if (observer) return;

        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type !== 'childList') continue;
                if (mutation.target instanceof Element && mutation.target.closest(CONTAINER_SELECTOR)) {
                    scheduleRender();
                    return;
                }

                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches?.(CONTAINER_SELECTOR) || node.querySelector?.(CONTAINER_SELECTOR)) {
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
        initObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
