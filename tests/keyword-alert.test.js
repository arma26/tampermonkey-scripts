const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeWhitespace,
    detectCheckoutContext,
    findMatches,
    buildMatchFingerprint
} = require('../keyword-alert.js');

test('detectCheckoutContext marks checkout-like pages from url and text', () => {
    const context = detectCheckoutContext(
        'https://example.com/checkout/review',
        'Shipping address Place order'
    );

    assert.equal(context.isCheckoutLike, true);
    assert.deepEqual(context.reasons, ['url', 'text']);
});

test('findMatches groups visible text and field hits by pattern', () => {
    const matches = findMatches(
        {
            text: 'Ship to 123 Old Street Springfield, CA 90001 before checkout.'
        },
        [
            { source: 'input', label: 'Shipping address', text: '123 Old Street' },
            { source: 'textarea', label: 'Notes', text: 'leave at door' }
        ],
        [
            { name: 'Old Address', regex: /123 Old Street/i, severity: 'high' },
            { name: 'Old ZIP', regex: /\b90001\b/i, severity: 'high' }
        ],
        80
    );

    assert.equal(matches.length, 2);
    assert.equal(matches[0].name, 'Old Address');
    assert.equal(matches[0].hits.length, 2);
    assert.equal(matches[0].hits[0].source, 'visible-text');
    assert.equal(matches[0].hits[1].source, 'input');
    assert.equal(matches[1].name, 'Old ZIP');
    assert.equal(matches[1].hits.length, 1);
});

test('buildMatchFingerprint is stable for equivalent match sets', () => {
    const context = { isCheckoutLike: true };
    const matches = [
        {
            name: 'Old Address',
            severity: 'high',
            hits: [
                { source: 'input', snippet: '123 Old Street', label: 'Shipping address' }
            ]
        }
    ];

    const first = buildMatchFingerprint(matches, context);
    const second = buildMatchFingerprint(
        [
            {
                name: 'Old Address',
                severity: 'high',
                hits: [
                    { source: 'input', snippet: '123 Old Street', label: 'Shipping address' }
                ]
            }
        ],
        { isCheckoutLike: true }
    );

    assert.equal(first, second);
});

test('normalizeWhitespace collapses spacing and trims edges', () => {
    assert.equal(normalizeWhitespace('  old   address \n\t line  '), 'old address line');
});
