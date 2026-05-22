const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.join(__dirname, '..', 'makerworld-search-excluder.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

const {
    normalizeKeyword,
    normalizeKeywords,
    mergeExcludedKeywords,
    removeKeywordFromList,
    findKeywordRemoveChip,
    normalizeFilterToken,
    readExcludedKeywordsFromUrl,
    readIncludedKeywordsFromUrl,
    writeExcludedKeywordsToUrl,
    writeIncludedKeywordsToUrl,
    titleMatchesExcludedKeyword,
    titleMatchesIncludedKeywords,
    updatePaginationUrl,
    shouldReplaceCardWithPlaceholder,
    shouldFilterTitle,
    getFilterToggleLabel
} = require('../makerworld-search-excluder.js');

test('normalizeKeyword trims and lowercases values', () => {
    assert.equal(normalizeKeyword('  GridFinity  '), 'gridfinity');
    assert.equal(normalizeKeyword(''), '');
});

test('normalizeFilterToken strips non-alphanumeric characters for matching', () => {
    assert.equal(normalizeFilterToken('Multi Board'), 'multiboard');
    assert.equal(normalizeFilterToken('multi-board'), 'multiboard');
    assert.equal(normalizeFilterToken('multi_board'), 'multiboard');
});

test('normalizeKeywords splits comma and newline separated input and removes duplicates', () => {
    assert.deepEqual(
        normalizeKeywords('gridfinity,  wall mount\nGridfinity\nmulticonnect'),
        ['gridfinity', 'wall mount', 'multiconnect']
    );
});

test('mergeExcludedKeywords adds new keywords without dropping existing ones', () => {
    assert.deepEqual(
        mergeExcludedKeywords(['gridfinity', 'wall mount'], 'multiconnect, gridfinity\norganizer'),
        ['gridfinity', 'wall mount', 'multiconnect', 'organizer']
    );
});

test('removeKeywordFromList removes the exact normalized keyword from a list', () => {
    assert.deepEqual(
        removeKeywordFromList(['gridfinity', 'wall mount', 'multiconnect'], 'wall mount'),
        ['gridfinity', 'multiconnect']
    );
});

test('findKeywordRemoveChip resolves chip clicks from the chip root or nested text node', () => {
    const chip = {
        dataset: { keyword: 'wall mount', keywordType: 'include' },
        closest(selector) {
            assert.equal(selector, '[data-keyword][data-keyword-type]');
            return this;
        }
    };
    const textNodeTarget = {
        parentElement: chip
    };

    assert.equal(findKeywordRemoveChip(chip), chip);
    assert.equal(findKeywordRemoveChip(textNodeTarget), chip);
    assert.equal(findKeywordRemoveChip(null), null);
});

test('keyword chips are rendered as native buttons for reliable click handling', () => {
    assert.match(
        scriptSource,
        /const tag = document\.createElement\('button'\);/,
        'chip root should be a real button instead of a span with role=button'
    );
});

test('readExcludedKeywordsFromUrl returns normalized keywords from tmExclude', () => {
    assert.deepEqual(
        readExcludedKeywordsFromUrl(
            'https://makerworld.com/en/search/models?keyword=multiconnect&tmExclude=Gridfinity%2Cwall%20mount'
        ),
        ['gridfinity', 'wall mount']
    );
});

test('readIncludedKeywordsFromUrl returns normalized keywords from tmInclude', () => {
    assert.deepEqual(
        readIncludedKeywordsFromUrl(
            'https://makerworld.com/en/search/models?keyword=multiconnect&tmInclude=grid%20finity%2Cwall'
        ),
        ['grid finity', 'wall']
    );
});

test('writeExcludedKeywordsToUrl stores exclusions without changing other query params', () => {
    const nextUrl = new URL(
        writeExcludedKeywordsToUrl(
            'https://makerworld.com/en/search/models?keyword=multiconnect&page=2',
            ['gridfinity', 'wall mount']
        )
    );

    assert.equal(nextUrl.searchParams.get('keyword'), 'multiconnect');
    assert.equal(nextUrl.searchParams.get('page'), '2');
    assert.equal(nextUrl.searchParams.get('tmExclude'), 'gridfinity,wall mount');
});

test('writeIncludedKeywordsToUrl stores includes without changing other query params', () => {
    const nextUrl = new URL(
        writeIncludedKeywordsToUrl(
            'https://makerworld.com/en/search/models?keyword=multiconnect&page=2',
            ['grid finity', 'wall']
        )
    );

    assert.equal(nextUrl.searchParams.get('keyword'), 'multiconnect');
    assert.equal(nextUrl.searchParams.get('page'), '2');
    assert.equal(nextUrl.searchParams.get('tmInclude'), 'grid finity,wall');
});

test('writeExcludedKeywordsToUrl removes tmExclude when list is empty', () => {
    assert.equal(
        writeExcludedKeywordsToUrl(
            'https://makerworld.com/en/search/models?keyword=multiconnect&page=2&tmExclude=gridfinity',
            []
        ),
        'https://makerworld.com/en/search/models?keyword=multiconnect&page=2'
    );
});

test('titleMatchesExcludedKeyword only matches against the title text', () => {
    assert.equal(
        titleMatchesExcludedKeyword('Custom Gridfinity Shelf - Multiboard/openGrid/GOEWS', ['gridfinity']),
        true
    );
    assert.equal(
        titleMatchesExcludedKeyword('Custom Multi Board Shelf', ['multiboard']),
        true
    );
    assert.equal(
        titleMatchesExcludedKeyword('Custom Multi-Board Shelf', ['multiboard']),
        true
    );
    assert.equal(
        titleMatchesExcludedKeyword('Custom Shelf - Multiboard/openGrid/GOEWS', ['gridfinity']),
        false
    );
});

test('titleMatchesIncludedKeywords requires all include keywords to match the title', () => {
    assert.equal(
        titleMatchesIncludedKeywords('Custom Multi Board Wall Shelf', ['multiboard', 'wall']),
        true
    );
    assert.equal(
        titleMatchesIncludedKeywords('Custom Multi Board Shelf', ['multiboard', 'wall']),
        false
    );
    assert.equal(
        titleMatchesIncludedKeywords('Custom Shelf', []),
        true
    );
});

test('updatePaginationUrl carries current exclusions into pagination links', () => {
    const nextUrl = new URL(
        updatePaginationUrl(
            '/en/search/models?keyword=multiconnect&page=3',
            ['wall'],
            ['gridfinity', 'wall mount'],
            'https://makerworld.com/en/search/models?keyword=multiconnect&page=2'
        )
    );

    assert.equal(nextUrl.searchParams.get('keyword'), 'multiconnect');
    assert.equal(nextUrl.searchParams.get('page'), '3');
    assert.equal(nextUrl.searchParams.get('tmInclude'), 'wall');
    assert.equal(nextUrl.searchParams.get('tmExclude'), 'gridfinity,wall mount');
});

test('shouldFilterTitle applies include first and exclude second when filter is enabled', () => {
    assert.equal(
        shouldFilterTitle('Custom Multi Board Wall Shelf', ['multiboard', 'wall'], ['socket'], true),
        false
    );
    assert.equal(
        shouldFilterTitle('Custom Multi Board Shelf', ['multiboard', 'wall'], ['socket'], true),
        true
    );
    assert.equal(
        shouldFilterTitle('Custom Multi Board Wall Socket Shelf', ['multiboard', 'wall'], ['socket'], true),
        true
    );
    assert.equal(
        shouldFilterTitle('Custom Multi Board Shelf', ['multiboard'], ['socket'], false),
        false
    );
});

test('shouldReplaceCardWithPlaceholder only replaces matching cards when filter is enabled', () => {
    assert.equal(
        shouldReplaceCardWithPlaceholder(
            'Custom Gridfinity Shelf - Multiboard/openGrid/GOEWS',
            ['gridfinity'],
            true
        ),
        true
    );
    assert.equal(
        shouldReplaceCardWithPlaceholder(
            'Custom Gridfinity Shelf - Multiboard/openGrid/GOEWS',
            ['gridfinity'],
            false
        ),
        false
    );
    assert.equal(
        shouldReplaceCardWithPlaceholder(
            'Custom Shelf - Multiboard/openGrid/GOEWS',
            ['gridfinity'],
            true
        ),
        false
    );
});

test('getFilterToggleLabel reflects the current global filter state', () => {
    assert.equal(getFilterToggleLabel(true), 'Filter on');
    assert.equal(getFilterToggleLabel(false), 'Filter off');
});
