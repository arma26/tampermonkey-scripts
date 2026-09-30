const test = require('node:test');
const assert = require('node:assert/strict');

const scriptModule = require('../harborfreight-price-history.js');
const {
    getSkuFromPath,
    parsePriceHistory,
    computeStats,
    renderStepChart
} = scriptModule;

test('getSkuFromPath extracts the trailing SKU from a HF product URL path', () => {
    assert.equal(
        getSkuFromPath('/3-23-in-x-9-in-150-grit-13-sheet-sandpaper-with-ceramic-alumina-grain-5-pk-58190.html'),
        '58190'
    );
    assert.equal(getSkuFromPath('/1-in-chip-brush-58105.html'), '58105');
    assert.equal(getSkuFromPath('/some-page'), null);
    assert.equal(getSkuFromPath('/short-42.html'), null, 'SKU shorter than 3 digits is ignored');
    assert.equal(getSkuFromPath('/no-sku-here/'), null);
});

test('parsePriceHistory decodes the tracker page embedded data block', () => {
    const html = `
        <script>let _brand='Hercules';</script>
        <script>let _name='3-2/3 in. x 9 in. Sandpaper';</script>
        <script>let _SKU='58190';</script>
        <script>let _priceHistoryData ='[{"x":"2026-05-29T15:46:47.727Z","y":1.09},{"x":"2021-11-20T05:10:17.782Z","y":3.99},{"x":"2021-10-06T23:53:00.512Z","y":4.99}]';</script>
    `;

    const parsed = parsePriceHistory(html);
    assert.equal(parsed.sku, '58190');
    assert.equal(parsed.brand, 'Hercules');
    assert.equal(parsed.name, '3-2/3 in. x 9 in. Sandpaper');
    assert.equal(parsed.points.length, 3);

    // Points are sorted ascending by time.
    assert.deepEqual(
        parsed.points.map(point => point.price),
        [4.99, 3.99, 1.09]
    );
    assert.equal(parsed.points[0].time, new Date('2021-10-06T23:53:00.512Z').getTime());
    assert.equal(parsed.points[2].time, new Date('2026-05-29T15:46:47.727Z').getTime());
});

test('parsePriceHistory tolerates a missing data block', () => {
    const parsed = parsePriceHistory('<html><body>nothing</body></html>');
    assert.deepEqual(parsed.points, []);
    assert.equal(parsed.sku, null);
});

test('parsePriceHistory tolerates a backtick-quoted data block', () => {
    const html = 'let _priceHistoryData = `[{"x":"2025-01-01T00:00:00.000Z","y":2.5}]`;';
    const parsed = parsePriceHistory(html);
    assert.equal(parsed.points.length, 1);
    assert.equal(parsed.points[0].price, 2.5);
});

test('computeStats reports current, lowest, highest, and change count', () => {
    const points = [
        { time: 1, price: 4.99 },
        { time: 2, price: 3.99 },
        { time: 3, price: 1.09 }
    ];
    assert.deepEqual(computeStats(points), {
        current: 1.09,
        lowest: 1.09,
        highest: 4.99,
        changes: 3
    });
    assert.equal(computeStats([]), null);
});

test('renderStepChart produces a step-after SVG with one dot per point', () => {
    const points = [
        { time: 1, price: 3.99 },
        { time: 2, price: 1.09 }
    ];
    const svg = renderStepChart(points, 400, 200);
    assert.match(svg, /<svg /);
    assert.match(svg, /<path /);
    assert.equal((svg.match(/<circle /g) || []).length, 2);
    assert.match(svg, /role="img"/);

    assert.equal(renderStepChart([], 400, 200), '', 'empty points produce no svg');
});
