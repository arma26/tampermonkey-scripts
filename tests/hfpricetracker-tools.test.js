const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.join(__dirname, '..', 'hfpricetracker-tools.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');
const scriptModule = require('../hfpricetracker-tools.js');
const {
    parsePriceValue,
    parseChangePercentValue,
    getDefaultSortState,
    getNextSortState,
    sortProductData
} = scriptModule;

test('HF Price Tracker table styles do not force block layout', () => {
    assert.doesNotMatch(
        scriptSource,
        /#\$\{TABLE_ID\}\s*\{\s*display:\s*block;/,
        'table view should keep native table layout so columns can expand across the available width'
    );
});

test('HF Price Tracker table styles keep the table at least as wide as the container', () => {
    assert.match(
        scriptSource,
        /#\$\{TABLE_ID\}\s*\{[\s\S]*min-width:\s*100%;/,
        'table view should have a minimum width of the container to avoid blank space to the right of columns'
    );
});

test('parse helpers convert rendered strings to sortable numeric values', () => {
    assert.equal(parsePriceValue('$89.99'), 89.99);
    assert.equal(parsePriceValue(''), null);
    assert.equal(parseChangePercentValue('25% ↓'), -25);
    assert.equal(parseChangePercentValue('11% ↑'), 11);
});

test('getNextSortState preserves unsorted initial state and toggles on repeat click', () => {
    const initial = getDefaultSortState();
    assert.deepEqual(initial, { column: null, direction: null });

    assert.deepEqual(getNextSortState(initial, 'brand'), {
        column: 'brand',
        direction: 'asc'
    });
    assert.deepEqual(getNextSortState({ column: 'brand', direction: 'asc' }, 'brand'), {
        column: 'brand',
        direction: 'desc'
    });
    assert.deepEqual(getNextSortState({ column: 'brand', direction: 'desc' }, 'change'), {
        column: 'change',
        direction: 'desc'
    });
});

test('sortProductData keeps original order before sorting and sorts change descending', () => {
    const rows = [
        { productName: 'A', changeValue: 11, originalIndex: 0 },
        { productName: 'B', changeValue: 67, originalIndex: 1 },
        { productName: 'C', changeValue: null, originalIndex: 2 }
    ];

    assert.deepEqual(
        sortProductData(rows, getDefaultSortState()).map(row => row.productName),
        ['A', 'B', 'C']
    );
    assert.deepEqual(
        sortProductData(rows, { column: 'change', direction: 'desc' }).map(row => row.productName),
        ['B', 'A', 'C']
    );
});
