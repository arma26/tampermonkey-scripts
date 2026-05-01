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
    savePatternConfigs,
    getRuntimePatterns,
    refreshRuntimePatterns,
    findRuntimeMatches,
    promptForPatternConfig,
    createMenuHandlers,
    registerMenuCommands
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
        assert.equal(typeof fallbackValue, 'symbol');
        return storedConfigs;
    };

    try {
        assert.deepEqual(loadPatternConfigs(), storedConfigs);
    } finally {
        delete global.GM_getValue;
    }
});

test('loadPatternConfigs preserves an intentionally empty stored array', () => {
    global.GM_getValue = () => [];

    try {
        assert.deepEqual(loadPatternConfigs(), []);
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

test('loadPatternConfigs falls back to defaults for mixed-validity stored configs', () => {
    global.GM_getValue = () => [
        { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'normal' },
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

test('findRuntimeMatches uses refreshed storage-backed patterns', () => {
    global.GM_getValue = () => [
        { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'high' }
    ];

    try {
        refreshRuntimePatterns();

        const runtime = getRuntimePatterns();
        const matches = findRuntimeMatches(
            { text: 'This page contains stored value only.' },
            []
        );

        assert.equal(runtime.patterns.length, 1);
        assert.equal(runtime.patterns[0].name, 'Stored Phrase');
        assert.equal(matches.length, 1);
        assert.equal(matches[0].name, 'Stored Phrase');
    } finally {
        delete global.GM_getValue;
        refreshRuntimePatterns();
    }
});

test('refreshRuntimePatterns preserves an intentionally empty configuration', () => {
    global.GM_getValue = () => [];

    try {
        const runtime = refreshRuntimePatterns();
        const matches = findRuntimeMatches(
            { text: 'This page contains example phrase and 4242.' },
            []
        );

        assert.deepEqual(runtime.patternConfigs, []);
        assert.deepEqual(runtime.patterns, []);
        assert.equal(runtime.errors.length, 0);
        assert.deepEqual(matches, []);
    } finally {
        delete global.GM_getValue;
        refreshRuntimePatterns();
    }
});

test('promptForPatternConfig returns a serializable pattern config for valid prompts', () => {
    const prompts = [
        'Stored Phrase',
        'stored value',
        'gi',
        'high'
    ];

    const config = promptForPatternConfig(null, {
        prompt: () => prompts.shift(),
        alert: () => {
            throw new Error('alert should not be called');
        }
    });

    assert.deepEqual(config, {
        name: 'Stored Phrase',
        source: 'stored value',
        flags: 'gi',
        severity: 'high'
    });
});

test('promptForPatternConfig rejects invalid regex input with prompt feedback', () => {
    const promptMessages = [];
    const prompts = [
        'Broken Pattern',
        '(',
        '',
        'normal'
    ];

    const config = promptForPatternConfig(null, {
        prompt: message => {
            promptMessages.push(message);
            return prompts.shift();
        },
        alert: () => {
            throw new Error('alert should not be called');
        }
    });

    assert.equal(config, null);
    assert.equal(promptMessages.length, 5);
    assert.match(promptMessages[4], /invalid regex/i);
});

test('createMenuHandlers addKeyword saves refreshes and schedules a rescan', () => {
    const savedStates = [];
    const callLog = [];
    const handlers = createMenuHandlers({
        loadPatternConfigs: () => [],
        savePatternConfigs: configs => {
            savedStates.push(configs);
            callLog.push('save');
        },
        refreshRuntimePatterns: () => {
            callLog.push('refresh');
        },
        scheduleScan: () => {
            callLog.push('scan');
        },
        promptForPatternConfig: () => ({
            name: 'Stored Phrase',
            source: 'stored value',
            flags: 'i',
            severity: 'high'
        }),
        alert: () => {
            throw new Error('alert should not be called');
        },
        confirm: () => true
    });

    handlers.addKeyword();

    assert.deepEqual(savedStates, [[
        { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'high' }
    ]]);
    assert.deepEqual(callLog, ['save', 'refresh', 'scan']);
});

test('createMenuHandlers resetKeywords respects cancellation', () => {
    const callLog = [];
    const handlers = createMenuHandlers({
        loadPatternConfigs: () => [{ name: 'Keep', source: 'keep', flags: 'i', severity: 'normal' }],
        savePatternConfigs: () => {
            callLog.push('save');
        },
        refreshRuntimePatterns: () => {
            callLog.push('refresh');
        },
        scheduleScan: () => {
            callLog.push('scan');
        },
        promptForPatternConfig: () => null,
        alert: () => {},
        confirm: () => false
    });

    handlers.resetKeywords();

    assert.deepEqual(callLog, []);
});

test('createMenuHandlers removeKeyword preserves an empty saved list when removing the final keyword', () => {
    const savedStates = [];
    const callLog = [];
    const promptReplies = ['1'];
    const handlers = createMenuHandlers({
        loadPatternConfigs: () => [
            { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'high' }
        ],
        savePatternConfigs: configs => {
            savedStates.push(configs);
            callLog.push('save');
        },
        refreshRuntimePatterns: () => {
            callLog.push('refresh');
        },
        scheduleScan: () => {
            callLog.push('scan');
        },
        prompt: () => promptReplies.shift(),
        confirm: () => true,
        alert: () => {
            throw new Error('alert should not be called');
        }
    });

    handlers.removeKeyword();

    assert.deepEqual(savedStates, [[]]);
    assert.deepEqual(callLog, ['save', 'refresh', 'scan']);
});

test('createMenuHandlers listKeywords uses prompt instead of alert', () => {
    const promptMessages = [];
    const handlers = createMenuHandlers({
        loadPatternConfigs: () => [
            { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'high' }
        ],
        prompt: message => {
            promptMessages.push(message);
            return null;
        },
        alert: () => {
            throw new Error('alert should not be called');
        },
        confirm: () => true
    });

    handlers.listKeywords();

    assert.equal(promptMessages.length, 1);
    assert.match(promptMessages[0], /Stored Phrase/);
});

test('createMenuHandlers editKeyword reports invalid index through prompt', () => {
    const promptMessages = [];
    const promptReplies = ['9', null];
    const handlers = createMenuHandlers({
        loadPatternConfigs: () => [
            { name: 'Stored Phrase', source: 'stored value', flags: 'i', severity: 'high' }
        ],
        savePatternConfigs: () => {
            throw new Error('save should not be called');
        },
        refreshRuntimePatterns: () => {
            throw new Error('refresh should not be called');
        },
        scheduleScan: () => {
            throw new Error('scan should not be called');
        },
        prompt: message => {
            promptMessages.push(message);
            return promptReplies.shift();
        },
        promptForPatternConfig: () => {
            throw new Error('promptForPatternConfig should not be called');
        },
        alert: () => {
            throw new Error('alert should not be called');
        },
        confirm: () => true
    });

    handlers.editKeyword();

    assert.equal(promptMessages.length, 2);
    assert.match(promptMessages[0], /Enter the keyword number/i);
    assert.match(promptMessages[1], /Invalid keyword number/i);
});

test('registerMenuCommands registers each label once', () => {
    const registrations = [];
    const handlers = {
        listKeywords() {},
        addKeyword() {},
        editKeyword() {},
        removeKeyword() {},
        resetKeywords() {}
    };

    registerMenuCommands({
        registerCommand: (label, fn) => registrations.push({ label, fn }),
        handlers,
        resetRegistrationState: true
    });
    registerMenuCommands({
        registerCommand: (label, fn) => registrations.push({ label, fn }),
        handlers
    });

    assert.deepEqual(
        registrations.map(entry => entry.label),
        [
            'List keywords',
            'Add keyword',
            'Edit keyword',
            'Remove keyword',
            'Reset keywords to defaults'
        ]
    );
});
