const test = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeWhitespace,
    detectCheckoutContext,
    findMatches,
    buildMatchFingerprint,
    getAlertContent,
    getDefaultPatternConfigs,
    compilePatternConfigs,
    loadPatternConfigs,
    savePatternConfigs
} = require('../keyword-alert.js');

test('detectCheckoutContext marks checkout-like pages from url and text', () => {
    const context = detectCheckoutContext(
        'https://example.com/checkout/review',
        'Shipping details Place order'
    );

    assert.equal(context.isCheckoutLike, true);
    assert.deepEqual(context.reasons, ['url', 'text']);
});

test('findMatches groups visible text and field hits by pattern', () => {
    const matches = findMatches(
        {
            text: 'This page includes alpha target and a code 4242 before checkout.'
        },
        [
            { source: 'input', label: 'Primary field', text: 'alpha target' },
            { source: 'textarea', label: 'Notes', text: 'leave at door' }
        ],
        [
            { name: 'Target Phrase', regex: /alpha target/i, severity: 'high' },
            { name: 'Target Code', regex: /\b4242\b/i, severity: 'high' }
        ],
        80
    );

    assert.equal(matches.length, 2);
    assert.equal(matches[0].name, 'Target Phrase');
    assert.equal(matches[0].hits.length, 2);
    assert.equal(matches[0].hits[0].source, 'visible-text');
    assert.equal(matches[0].hits[1].source, 'input');
    assert.equal(matches[1].name, 'Target Code');
    assert.equal(matches[1].hits.length, 1);
});

test('buildMatchFingerprint is stable for equivalent match sets', () => {
    const context = { isCheckoutLike: true };
    const matches = [
        {
            name: 'Target Phrase',
            severity: 'high',
            hits: [
                { source: 'input', snippet: 'alpha target', label: 'Primary field' }
            ]
        }
    ];

    const first = buildMatchFingerprint(matches, context);
    const second = buildMatchFingerprint(
        [
            {
                name: 'Target Phrase',
                severity: 'high',
                hits: [
                    { source: 'input', snippet: 'alpha target', label: 'Primary field' }
                ]
            }
        ],
        { isCheckoutLike: true }
    );

    assert.equal(first, second);
});

test('normalizeWhitespace collapses spacing and trims edges', () => {
    assert.equal(normalizeWhitespace('  target   phrase \n\t line  '), 'target phrase line');
});

test('getAlertContent uses generic warning copy', () => {
    const generic = getAlertContent({ isCheckoutLike: false });
    const risky = getAlertContent({ isCheckoutLike: true });

    assert.equal(generic.title, 'Keyword match warning');
    assert.match(generic.subtitle, /Configured patterns matched/i);
    assert.equal(risky.title, 'Keyword match warning on a high-risk page');
    assert.match(risky.subtitle, /checkout, orders, billing, shipping, profile/i);
});

test('getDefaultPatternConfigs returns serializable defaults', () => {
    const defaults = getDefaultPatternConfigs();

    assert.deepEqual(defaults, [
        { name: 'Target Phrase', source: 'example phrase', flags: 'i', severity: 'high' },
        { name: 'Target Code', source: '\\b4242\\b', flags: 'i', severity: 'high' }
    ]);
});

test('compilePatternConfigs converts stored configs into runtime regexes', () => {
    const result = compilePatternConfigs([
        { name: 'Phrase', source: 'alpha target', flags: 'i', severity: 'high' }
    ]);

    assert.equal(result.errors.length, 0);
    assert.equal(result.patterns.length, 1);
    assert.equal(result.patterns[0].name, 'Phrase');
    assert.equal(result.patterns[0].source, 'alpha target');
    assert.equal(result.patterns[0].flags, 'i');
    assert.equal(result.patterns[0].regex.test('ALPHA TARGET'), true);
});

test('compilePatternConfigs reports invalid regex configs', () => {
    const result = compilePatternConfigs([
        { name: 'Broken', source: '(', flags: '' }
    ]);

    assert.equal(result.patterns.length, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].message, /invalid regular expression/i);
});

test('loadPatternConfigs falls back to defaults when storage is unavailable', () => {
    const loaded = loadPatternConfigs();

    assert.deepEqual(loaded, getDefaultPatternConfigs());
});

test('loadPatternConfigs uses stored configs when GM_getValue is available', () => {
    const storedConfigs = [
        { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'normal' }
    ];

    global.GM_getValue = (key, fallbackValue) => {
        assert.equal(key, 'keyword-alert-patterns');
        assert.deepEqual(fallbackValue, getDefaultPatternConfigs());
        return storedConfigs;
    };

    try {
        assert.deepEqual(loadPatternConfigs(), storedConfigs);
    } finally {
        delete global.GM_getValue;
    }
});

test('loadPatternConfigs falls back to defaults for an empty stored array', () => {
    global.GM_getValue = () => [];

    try {
        assert.deepEqual(loadPatternConfigs(), getDefaultPatternConfigs());
    } finally {
        delete global.GM_getValue;
    }
});

test('loadPatternConfigs falls back to defaults for invalid stored configs', () => {
    global.GM_getValue = () => [
        { name: 'Broken', source: '(', flags: '' }
    ];

    try {
        assert.deepEqual(loadPatternConfigs(), getDefaultPatternConfigs());
    } finally {
        delete global.GM_getValue;
    }
});

test('savePatternConfigs uses GM_setValue when available', () => {
    const savedCalls = [];
    const patternConfigs = [
        { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'normal' }
    ];

    global.GM_setValue = (key, value) => {
        savedCalls.push({ key, value });
    };

    try {
        savePatternConfigs(patternConfigs);
    } finally {
        delete global.GM_setValue;
    }

    assert.deepEqual(savedCalls, [
        { key: 'keyword-alert-patterns', value: patternConfigs }
    ]);
});
