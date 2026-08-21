const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildAmazonSearchUrl,
    extractBookTitle,
    buildButtonLabel
} = require('../audible-amazon-redirect.js');

test('buildAmazonSearchUrl encodes a plain book title into an Amazon search', () => {
    assert.equal(
        buildAmazonSearchUrl('Example Book Title'),
        'https://www.amazon.com/s?k=Example+Book+Title'
    );
});

test('extractBookTitle prefers the visible heading title', () => {
    const heading = { textContent: '  Example Book Title  ' };
    const doc = {
        querySelector(selector) {
            if (selector === 'h1') return heading;
            return null;
        }
    };

    assert.equal(extractBookTitle(doc), 'Example Book Title');
});

test('extractBookTitle falls back to og:title metadata when no heading exists', () => {
    const meta = { content: 'Example Book Title' };
    const doc = {
        querySelector(selector) {
            if (selector === 'h1') return null;
            if (selector === 'meta[property="og:title"]') return meta;
            return null;
        }
    };

    assert.equal(extractBookTitle(doc), 'Example Book Title');
});

test('buildButtonLabel includes the extracted title for context', () => {
    assert.equal(
        buildButtonLabel('Example Book Title'),
        'Search Amazon for "Example Book Title"'
    );
});
