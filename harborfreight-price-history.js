// ==UserScript==
// @name         Harbor Freight Price History
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Embed hfpricetracker.com price history on harborfreight.com product pages
// @match        https://www.harborfreight.com/*
// @connect      hfpricetracker.com
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';

    const CARD_ID = 'hfpt-price-history-card';
    const STYLE_ID = 'hfpt-price-history-style';
    const TRACKER_ORIGIN = 'https://hfpricetracker.com';
    const TRACKER_TOOL_PATH = '/tools/';
    const SKU_PATTERN = /-(\d{3,8})\.html\/?$/i;
    const FALLBACK_MS = 4000;

    // Product title-like elements to insert the card after.
    const TITLE_ANCHORS = [
        'h1[itemprop="name"]',
        'h1.product-name',
        '[data-testid="product-name"]',
        '.product-title',
        'h1'
    ];

    // Container elements to prepend into when no title is found.
    const CONTAINER_ANCHORS = [
        '#product-details',
        '#maincontent',
        '.product-info',
        'main'
    ];

    let injected = false;
    let startTime = 0;
    let observer = null;

    function getSkuFromPath(pathname) {
        const match = String(pathname || '').match(SKU_PATTERN);
        return match ? match[1] : null;
    }

    // Extract the price-history array string embedded in the tracker page.
    function parsePriceHistory(html) {
        const source = String(html || '');
        const dataMatch = source.match(/_priceHistoryData\s*=\s*(?:'([^']*)'|`([^`]*)`)/);
        if (!dataMatch) return { points: [], sku: null, name: '', brand: '' };

        const raw = dataMatch[1] !== undefined ? dataMatch[1] : dataMatch[2];
        const skuMatch = source.match(/_SKU\s*=\s*(?:'([^']*)'|"([^"]*)")/);
        const nameMatch = source.match(/_name\s*=\s*(?:'([^']*)'|"([^"]*)")/);
        const brandMatch = source.match(/_brand\s*=\s*(?:'([^']*)'|"([^"]*)")/);

        let points = [];
        try {
            points = JSON.parse(raw || '[]');
        } catch (err) {
            points = [];
        }

        // Normalize to { time, price } and sort ascending by time.
        points = points
            .map(point => ({
                time: new Date(point.x).getTime(),
                price: Number(point.y)
            }))
            .filter(point => Number.isFinite(point.time) && Number.isFinite(point.price))
            .sort((left, right) => left.time - right.time);

        return {
            points,
            sku: skuMatch ? skuMatch[1] || skuMatch[2] : null,
            name: nameMatch ? (nameMatch[1] || nameMatch[2]) : '',
            brand: brandMatch ? (brandMatch[1] || brandMatch[2]) : ''
        };
    }

    function fetchTrackerPage(sku) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${TRACKER_ORIGIN}${TRACKER_TOOL_PATH}${encodeURIComponent(sku)}`,
                timeout: 10000,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 400) {
                        resolve(response.responseText);
                    } else {
                        reject(new Error(`Tracker returned status ${response.status}`));
                    }
                },
                onerror: () => reject(new Error('Tracker request failed')),
                ontimeout: () => reject(new Error('Tracker request timed out'))
            });
        });
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(value);
    }

    function formatDate(time) {
        return new Date(time).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function computeStats(points) {
        if (!points.length) return null;

        const prices = points.map(point => point.price);
        return {
            current: points[points.length - 1].price,
            lowest: Math.min(...prices),
            highest: Math.max(...prices),
            changes: points.length
        };
    }

    function renderStepChart(points, width, height) {
        width = width || 640;
        height = height || 220;
        const pad = { top: 12, right: 12, bottom: 28, left: 52 };

        if (!points || points.length === 0) return '';

        const xs = points.map(point => point.time);
        const ys = points.map(point => point.price);
        const minX = xs[0];
        const maxX = xs[xs.length - 1];
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const ySpan = (maxY - minY) || 1;
        const xSpan = (maxX - minX) || 1;

        const plotW = width - pad.left - pad.right;
        const plotH = height - pad.top - pad.bottom;

        const sx = time => pad.left + ((time - minX) / xSpan) * plotW;
        const sy = price => pad.top + (1 - (price - minY) / ySpan) * plotH;

        // Step-after path: hold each price until the next change, then drop.
        let lineD = '';
        let areaD = '';
        for (let i = 0; i < points.length; i++) {
            const x = sx(points[i].time).toFixed(2);
            const y = sy(points[i].price).toFixed(2);
            if (i === 0) {
                lineD += `M ${x} ${y}`;
                areaD += `M ${x} ${y}`;
            } else {
                const prevY = sy(points[i - 1].price).toFixed(2);
                lineD += ` L ${x} ${prevY} L ${x} ${y}`;
                areaD += ` L ${x} ${prevY} L ${x} ${y}`;
            }
        }
        const lastX = sx(points[points.length - 1].time).toFixed(2);
        const baselineY = (pad.top + plotH).toFixed(2);
        areaD += ` L ${lastX} ${baselineY} L ${sx(points[0].time).toFixed(2)} ${baselineY} Z`;

        const dots = points.map(point => {
            const x = sx(point.time).toFixed(2);
            const y = sy(point.price).toFixed(2);
            return `<circle cx="${x}" cy="${y}" r="3" fill="#2563eb" stroke="#fff" stroke-width="1">` +
                `<title>${formatDate(point.time)} — ${formatCurrency(point.price)}</title></circle>`;
        }).join('');

        // Minimal axis labels.
        const yTicks = [maxY, minY].map(price =>
            `<text x="${pad.left - 6}" y="${sy(price).toFixed(2)}" text-anchor="end" ` +
            `dominant-baseline="middle" font-size="11" fill="#666">${formatCurrency(price)}</text>`
        ).join('');
        const xTicks = [
            { time: minX, anchor: 'start' },
            { time: maxX, anchor: 'end' }
        ].map(tick =>
            `<text x="${sx(tick.time).toFixed(2)}" y="${height - 8}" text-anchor="${tick.anchor}" ` +
            `font-size="11" fill="#666">${formatDate(tick.time)}</text>`
        ).join('');

        return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" ` +
            `style="width:100%;height:auto;display:block" role="img" aria-label="Price history chart">` +
            `<path d="${areaD}" fill="rgba(37,99,235,0.08)" stroke="none"></path>` +
            `<path d="${lineD}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round"></path>` +
            `${dots}${yTicks}${xTicks}</svg>`;
    }

    function buildCard(data, sku) {
        const stats = computeStats(data.points);

        const card = document.createElement('div');
        card.id = CARD_ID;

        const heading = data.brand
            ? `${data.brand} — ${data.name}`
            : (data.name || `SKU ${sku}`);

        let statsHtml = '';
        if (stats) {
            statsHtml = `
                <div class="hfpt-stats">
                    <div class="hfpt-stat"><span class="hfpt-label">Current</span><span class="hfpt-value">${formatCurrency(stats.current)}</span></div>
                    <div class="hfpt-stat"><span class="hfpt-label">Lowest</span><span class="hfpt-value">${formatCurrency(stats.lowest)}</span></div>
                    <div class="hfpt-stat"><span class="hfpt-label">Highest</span><span class="hfpt-value">${formatCurrency(stats.highest)}</span></div>
                    <div class="hfpt-stat"><span class="hfpt-label">Changes</span><span class="hfpt-value">${stats.changes}</span></div>
                </div>`;
        }

        const chartHtml = stats
            ? renderStepChart(data.points)
            : '<p class="hfpt-empty">No price history available.</p>';

        const trackerUrl = `${TRACKER_ORIGIN}${TRACKER_TOOL_PATH}${encodeURIComponent(sku)}`;

        card.innerHTML = `
            <div class="hfpt-header">
                <span class="hfpt-title">Price History</span>
                <a class="hfpt-link" href="${trackerUrl}" target="_blank" rel="noopener">${heading}</a>
            </div>
            ${statsHtml}
            <div class="hfpt-chart">${chartHtml}</div>`;

        return card;
    }

    function findAnchor() {
        for (const selector of TITLE_ANCHORS) {
            const el = document.querySelector(selector);
            if (el && el.textContent && el.textContent.trim().length > 2) {
                return { el, mode: 'after' };
            }
        }
        for (const selector of CONTAINER_ANCHORS) {
            const el = document.querySelector(selector);
            if (el) return { el, mode: 'prepend' };
        }
        return null;
    }

    function insertCard(card) {
        const anchor = findAnchor();
        if (anchor) {
            if (anchor.mode === 'after') {
                anchor.el.parentNode.insertBefore(card, anchor.el.nextSibling);
            } else {
                anchor.el.prepend(card);
            }
            card.classList.remove('hfpt-floating');
            return true;
        }
        return false;
    }

    function insertFloating(card) {
        card.classList.add('hfpt-floating');
        document.body.appendChild(card);
        injected = true;
    }

    function tryInject(card) {
        if (injected) return;
        if (insertCard(card)) {
            injected = true;
            return;
        }
        if (startTime && (Date.now() - startTime) > FALLBACK_MS) {
            insertFloating(card);
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${CARD_ID} {
                box-sizing: border-box;
                margin: 16px 0;
                padding: 12px 16px;
                border: 1px solid #d8dee6;
                border-radius: 8px;
                background: #fff;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #1a1a1a;
                max-width: 720px;
                width: 100%;
            }
            #${CARD_ID}.hfpt-floating {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 2147483000;
                width: 340px;
                max-width: calc(100vw - 32px);
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
            }
            #${CARD_ID} .hfpt-header {
                display: flex;
                flex-wrap: wrap;
                align-items: baseline;
                gap: 8px;
                margin-bottom: 10px;
            }
            #${CARD_ID} .hfpt-title {
                font-size: 14px;
                font-weight: 700;
                color: #1e293b;
            }
            #${CARD_ID} .hfpt-link {
                font-size: 13px;
                color: #2563eb;
                text-decoration: none;
            }
            #${CARD_ID} .hfpt-link:hover {
                text-decoration: underline;
            }
            #${CARD_ID} .hfpt-stats {
                display: flex;
                flex-wrap: wrap;
                gap: 16px;
                margin-bottom: 10px;
            }
            #${CARD_ID} .hfpt-stat {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            #${CARD_ID} .hfpt-label {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: #64748b;
            }
            #${CARD_ID} .hfpt-value {
                font-size: 15px;
                font-weight: 600;
            }
            #${CARD_ID} .hfpt-chart {
                width: 100%;
            }
            #${CARD_ID} .hfpt-empty {
                margin: 0;
                color: #64748b;
            }
        `;

        document.head.appendChild(style);
    }

    function initObserver(card) {
        if (observer) return;

        observer = new MutationObserver(() => {
            if (injected) {
                observer.disconnect();
                observer = null;
                return;
            }
            tryInject(card);
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        const sku = getSkuFromPath(window.location.pathname);
        if (!sku) return;

        injectStyles();
        startTime = Date.now();

        fetchTrackerPage(sku)
            .then((html) => {
                const data = parsePriceHistory(html);
                const card = buildCard(data, sku);
                tryInject(card);
                if (!injected) initObserver(card);
            })
            .catch(() => {
                // Fail silently; no history is better than a broken injection.
            });
    }

    const api = {
        getSkuFromPath,
        parsePriceHistory,
        computeStats,
        renderStepChart
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
