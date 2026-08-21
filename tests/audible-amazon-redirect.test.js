const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'audible-amazon-redirect.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

function createElementFactory() {
    return function createElement(tagName) {
        return {
            tagName: String(tagName || '').toUpperCase(),
            id: '',
            href: '',
            textContent: '',
            content: '',
            style: {},
            attributes: {},
            setAttribute(name, value) {
                this.attributes[name] = value;
            }
        };
    };
}

function runUserscript({ headingText = '', metaTitle = '', containerSelectors = ['[data-testid="buybox"]'] } = {}) {
    const state = {
        appendedNodes: [],
        styleNodes: [],
        elementsById: new Map(),
        bodyAppends: 0,
        containerAppends: 0
    };
    const heading = headingText ? { textContent: headingText } : null;
    const meta = metaTitle ? { content: metaTitle } : null;
    const container = {
        appendChild(node) {
            state.containerAppends += 1;
            state.appendedNodes.push(node);
            if (node.id) state.elementsById.set(node.id, node);
            return node;
        }
    };
    const head = {
        appendChild(node) {
            state.styleNodes.push(node);
            if (node.id) state.elementsById.set(node.id, node);
            return node;
        }
    };
    const body = {
        appendChild(node) {
            state.bodyAppends += 1;
            state.appendedNodes.push(node);
            if (node.id) state.elementsById.set(node.id, node);
            return node;
        }
    };
    const selectorSet = new Set(containerSelectors);
    const document = {
        readyState: 'complete',
        head,
        body,
        querySelector(selector) {
            if (selector === 'h1') return heading;
            if (selector === 'meta[property="og:title"]') return meta;
            if (selectorSet.has(selector)) return container;
            return null;
        },
        getElementById(id) {
            return state.elementsById.get(id) || null;
        },
        createElement: createElementFactory(),
        addEventListener() {}
    };
    const context = {
        URL,
        console,
        document,
        window: {
            requestAnimationFrame(callback) {
                callback();
            }
        },
        MutationObserver: class {
            observe() {}
        }
    };

    vm.runInNewContext(scriptSource, context);
    return state;
}

test('adds an Amazon search button using the visible heading title', () => {
    const state = runUserscript({ headingText: '  Example Book Title  ' });
    const button = state.elementsById.get('tm-audible-amazon-redirect-button');

    assert.ok(button);
    assert.equal(button.href, 'https://www.amazon.com/s?k=Example+Book+Title');
    assert.equal(button.textContent, 'Search Amazon for "Example Book Title"');
    assert.equal(state.containerAppends, 1);
    assert.equal(state.bodyAppends, 0);
});

test('falls back to og:title metadata when the heading is missing', () => {
    const state = runUserscript({ metaTitle: 'Example Metadata Title' });
    const button = state.elementsById.get('tm-audible-amazon-redirect-button');

    assert.ok(button);
    assert.equal(button.href, 'https://www.amazon.com/s?k=Example+Metadata+Title');
    assert.equal(button.textContent, 'Search Amazon for "Example Metadata Title"');
});

test('falls back to document body when no buy-box container matches', () => {
    const state = runUserscript({ headingText: 'Example Book Title', containerSelectors: [] });
    const button = state.elementsById.get('tm-audible-amazon-redirect-button');
    const styleNode = state.elementsById.get('tm-audible-amazon-redirect-style');

    assert.ok(button);
    assert.ok(styleNode);
    assert.equal(state.containerAppends, 0);
    assert.equal(state.bodyAppends, 1);
    assert.match(styleNode.textContent, /body > #tm-audible-amazon-redirect-button/);
});

test('does not create a button when no title can be found', () => {
    const state = runUserscript();

    assert.equal(state.elementsById.get('tm-audible-amazon-redirect-button'), undefined);
});

test('injects its stylesheet once during initialization', () => {
    const state = runUserscript({ headingText: 'Example Book Title' });
    const styleNode = state.elementsById.get('tm-audible-amazon-redirect-style');

    assert.ok(styleNode);
    assert.match(styleNode.textContent, /tm-audible-amazon-redirect-button/);
});

test('executes without module in a browser-like context', () => {
    assert.doesNotMatch(scriptSource, /module\.exports/);
    assert.doesNotThrow(() => {
        runUserscript({ headingText: 'Example Book Title' });
    });
});
