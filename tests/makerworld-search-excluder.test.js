const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeKeyword,
    normalizeKeywords,
    mergeExcludedKeywords,
    normalizeFilterToken,
    readExcludedKeywordsFromUrl,
    writeExcludedKeywordsToUrl,
    titleMatchesExcludedKeyword,
    updatePaginationUrl,
    shouldReplaceCardWithPlaceholder,
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

test('readExcludedKeywordsFromUrl returns normalized keywords from tmExclude', () => {
    assert.deepEqual(
        readExcludedKeywordsFromUrl(
            'https://makerworld.com/en/search/models?keyword=multiconnect&tmExclude=Gridfinity%2Cwall%20mount'
        ),
        ['gridfinity', 'wall mount']
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

test('updatePaginationUrl carries current exclusions into pagination links', () => {
    const nextUrl = new URL(
        updatePaginationUrl(
            '/en/search/models?keyword=multiconnect&page=3',
            ['gridfinity', 'wall mount'],
            'https://makerworld.com/en/search/models?keyword=multiconnect&page=2'
        )
    );

    assert.equal(nextUrl.searchParams.get('keyword'), 'multiconnect');
    assert.equal(nextUrl.searchParams.get('page'), '3');
    assert.equal(nextUrl.searchParams.get('tmExclude'), 'gridfinity,wall mount');
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
