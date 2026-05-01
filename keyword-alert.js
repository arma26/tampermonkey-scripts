// ==UserScript==
// @name         Keyword Alert
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Alert when configured keyword regexes appear on webpages
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const PATTERN_STORAGE_KEY = 'keyword-alert-patterns';
    const NO_SAVED_PATTERN_CONFIGS = Symbol('no-saved-pattern-configs');
    const MENU_COMMAND_DEFINITIONS = [
        ['List keywords', 'listKeywords'],
        ['Add keyword', 'addKeyword'],
        ['Edit keyword', 'editKeyword'],
        ['Remove keyword', 'removeKeyword'],
        ['Reset keywords to defaults', 'resetKeywords']
    ];

    function getDefaultPatternConfigs() {
        return [
            { name: 'Target Phrase', source: 'example phrase', flags: 'i', severity: 'high' },
            { name: 'Target Code', source: '\\b4242\\b', flags: 'i', severity: 'high' }
        ];
    }

    function compilePatternConfigs(configs) {
        const patterns = [];
        const errors = [];

        for (const config of Array.isArray(configs) ? configs : []) {
            if (!config || typeof config !== 'object') {
                errors.push(new Error('Pattern config must be an object'));
                continue;
            }

            const name = typeof config.name === 'string' ? config.name.trim() : '';
            const source = typeof config.source === 'string' ? config.source : '';
            const flags = typeof config.flags === 'string' ? config.flags : '';
            const severity = typeof config.severity === 'string' && config.severity.trim()
                ? config.severity.trim()
                : 'normal';

            if (!name || !source) {
                errors.push(new Error('Pattern config requires non-empty name and source'));
                continue;
            }

            try {
                patterns.push({
                    name,
                    source,
                    flags,
                    severity,
                    regex: new RegExp(source, flags)
                });
            } catch (error) {
                errors.push(error instanceof Error ? error : new Error(String(error)));
            }
        }

        return { patterns, errors };
    }

    function getTampermonkeyValueGetter() {
        return typeof globalThis.GM_getValue === 'function' ? globalThis.GM_getValue : null;
    }

    function getTampermonkeyValueSetter() {
        return typeof globalThis.GM_setValue === 'function' ? globalThis.GM_setValue : null;
    }

    function getTampermonkeyMenuRegistrar() {
        return typeof globalThis.GM_registerMenuCommand === 'function'
            ? globalThis.GM_registerMenuCommand
            : null;
    }

    function loadPatternConfigs() {
        const defaults = getDefaultPatternConfigs();
        const getter = getTampermonkeyValueGetter();
        if (!getter) return defaults;

        const storedValue = getter(PATTERN_STORAGE_KEY, NO_SAVED_PATTERN_CONFIGS);
        if (storedValue === NO_SAVED_PATTERN_CONFIGS) {
            return defaults;
        }

        if (!Array.isArray(storedValue)) return defaults;

        const compiledStored = compilePatternConfigs(storedValue);
        if (compiledStored.errors.length > 0) {
            return defaults;
        }

        return storedValue;
    }

    function savePatternConfigs(patternConfigs) {
        const setter = getTampermonkeyValueSetter();
        if (!setter) return;

        setter(PATTERN_STORAGE_KEY, Array.isArray(patternConfigs) ? patternConfigs : []);
    }

    function createRuntimePatterns(compiledResult) {
        return {
            patternConfigs: compiledResult.patterns.map(pattern => ({
                name: pattern.name,
                source: pattern.source,
                flags: pattern.flags,
                severity: pattern.severity
            })),
            patterns: compiledResult.patterns,
            errors: compiledResult.errors
        };
    }

    function getDefaultRuntimePatterns() {
        return createRuntimePatterns(compilePatternConfigs(getDefaultPatternConfigs()));
    }

    const CONFIG = {
        checkoutSignals: {
            url: [/checkout/i, /cart/i, /order/i, /shipping/i, /billing/i, /profile/i, /account/i],
            text: [/place order/i, /shipping/i, /delivery/i, /billing/i, /account/i]
        },
        rescanDebounceMs: 250,
        maxCollectedTextLength: 50000,
        maxSnippetLength: 160,
        maxHitsPerPattern: 5
    };

    const ROOT_ID = 'tm-keyword-alert-root';
    const STYLE_ID = 'tm-keyword-alert-style';
    const OVERLAY_ID = 'tm-keyword-alert-overlay';
    const MODAL_ID = 'tm-keyword-alert-modal';
    const TITLE_ID = 'tm-keyword-alert-title';
    const BODY_ID = 'tm-keyword-alert-body';
    const DISMISS_ID = 'tm-keyword-alert-dismiss';
    const EXCLUDED_FIELD_TYPES = new Set([
        'hidden',
        'password',
        'checkbox',
        'radio',
        'submit',
        'button',
        'reset',
        'file',
        'image',
        'range',
        'color',
        'date',
        'datetime-local',
        'month',
        'time',
        'week'
    ]);

    let scanTimer = null;
    let observer = null;
    let scanInProgress = false;
    let rescanRequested = false;
    let currentFingerprint = '';
    let dismissedFingerprint = '';
    let runtimePatterns = getDefaultRuntimePatterns();
    let menuCommandsRegistered = false;

    function normalizeWhitespace(text) {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function cloneRegexWithGlobal(regex) {
        const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
        return new RegExp(regex.source, flags);
    }

    function truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
    }

    function createSnippet(text, matchIndex, matchText, maxLength) {
        const sourceText = normalizeWhitespace(text);
        if (!sourceText) return '';

        const normalizedMatch = normalizeWhitespace(matchText);
        const start = Math.max(0, matchIndex - Math.floor((maxLength - normalizedMatch.length) / 2));
        const end = Math.min(sourceText.length, start + maxLength);
        const rawSnippet = sourceText.slice(start, end);
        const prefix = start > 0 ? '...' : '';
        const suffix = end < sourceText.length ? '...' : '';
        return `${prefix}${rawSnippet}${suffix}`;
    }

    function buildMatchFingerprint(matches, context) {
        const normalizedMatches = matches
            .map(match => ({
                name: match.name,
                severity: match.severity || 'normal',
                hits: match.hits
                    .map(hit => ({
                        source: hit.source,
                        label: hit.label || '',
                        snippet: hit.snippet
                    }))
                    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
            }))
            .sort((left, right) => left.name.localeCompare(right.name));

        return JSON.stringify({
            checkout: Boolean(context?.isCheckoutLike),
            matches: normalizedMatches
        });
    }

    function detectCheckoutContext(url, visibleText, config = CONFIG.checkoutSignals) {
        const reasons = [];
        const normalizedText = normalizeWhitespace(visibleText).toLowerCase();

        if (config.url.some(pattern => pattern.test(url))) {
            reasons.push('url');
        }

        if (config.text.some(pattern => pattern.test(normalizedText))) {
            reasons.push('text');
        }

        return {
            isCheckoutLike: reasons.length > 0,
            reasons
        };
    }

    function buildFieldLabel(field) {
        const ariaLabel = normalizeWhitespace(field.getAttribute('aria-label'));
        if (ariaLabel) return ariaLabel;

        const placeholder = normalizeWhitespace(field.getAttribute('placeholder'));
        if (placeholder) return placeholder;

        const name = normalizeWhitespace(field.getAttribute('name'));
        if (name) return name;

        const id = normalizeWhitespace(field.id);
        if (!id) return 'field';

        try {
            const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
            const labelText = normalizeWhitespace(label?.textContent || '');
            return labelText || id;
        } catch {
            return id;
        }
    }

    function isVisibleElement(element) {
        if (!(element instanceof Element)) return false;
        if (element.id === ROOT_ID || element.closest?.(`#${ROOT_ID}`)) return false;

        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }

        return element.getClientRects().length > 0;
    }

    function shouldSkipTextNode(node) {
        const parent = node.parentElement;
        if (!parent) return true;
        if (parent.closest?.(`#${ROOT_ID}`)) return true;

        const tagName = parent.tagName;
        if (!tagName) return true;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(tagName)) return true;

        return !isVisibleElement(parent);
    }

    function collectVisibleText(maxLength = CONFIG.maxCollectedTextLength) {
        if (!document.body) {
            return { text: '', snippets: [] };
        }

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!(node instanceof Text)) return NodeFilter.FILTER_REJECT;
                if (shouldSkipTextNode(node)) return NodeFilter.FILTER_REJECT;

                const normalized = normalizeWhitespace(node.textContent);
                return normalized ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });

        const parts = [];
        let remaining = maxLength;

        while (remaining > 0) {
            const node = walker.nextNode();
            if (!node) break;

            const normalized = normalizeWhitespace(node.textContent);
            if (!normalized) continue;

            const nextPart = truncateText(normalized, remaining);
            if (!nextPart) break;
            parts.push(nextPart);
            remaining -= nextPart.length + 1;
        }

        return {
            text: parts.join(' '),
            snippets: parts
        };
    }

    function collectEditableFieldText() {
        if (!document.body) return [];

        const fields = Array.from(document.querySelectorAll('input, textarea, select'));
        const entries = [];

        for (const field of fields) {
            if (!(field instanceof HTMLElement)) continue;
            if (!isVisibleElement(field)) continue;
            if (field.closest?.(`#${ROOT_ID}`)) continue;
            if (field.hasAttribute('disabled') || field.getAttribute('aria-hidden') === 'true') continue;

            if (field instanceof HTMLInputElement) {
                const type = (field.type || 'text').toLowerCase();
                if (EXCLUDED_FIELD_TYPES.has(type)) continue;

                const value = normalizeWhitespace(field.value);
                if (!value) continue;

                entries.push({
                    source: 'input',
                    label: buildFieldLabel(field),
                    text: value
                });
                continue;
            }

            if (field instanceof HTMLTextAreaElement) {
                const value = normalizeWhitespace(field.value);
                if (!value) continue;

                entries.push({
                    source: 'textarea',
                    label: buildFieldLabel(field),
                    text: value
                });
                continue;
            }

            if (field instanceof HTMLSelectElement) {
                const value = normalizeWhitespace(field.selectedOptions?.[0]?.textContent || field.value);
                if (!value) continue;

                entries.push({
                    source: 'select',
                    label: buildFieldLabel(field),
                    text: value
                });
            }
        }

        return entries;
    }

    function collectPatternHits(text, regex, source, label, maxSnippetLength) {
        const hits = [];
        const matcher = cloneRegexWithGlobal(regex);
        const normalizedText = normalizeWhitespace(text);
        let match = matcher.exec(normalizedText);

        while (match && hits.length < CONFIG.maxHitsPerPattern) {
            const matchText = match[0];
            hits.push({
                source,
                label,
                snippet: source === 'visible-text'
                    ? createSnippet(normalizedText, match.index, matchText, maxSnippetLength)
                    : truncateText(normalizedText, maxSnippetLength)
            });

            if (match[0] === '') {
                matcher.lastIndex += 1;
            }

            match = matcher.exec(normalizedText);
        }

        return hits;
    }

    function dedupeHits(hits) {
        const seen = new Set();
        const deduped = [];

        for (const hit of hits) {
            const key = JSON.stringify(hit);
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(hit);
        }

        return deduped;
    }

    function findMatches(visibleTextResult, fieldEntries, patterns = runtimePatterns.patterns, maxSnippetLength = CONFIG.maxSnippetLength) {
        const matches = [];

        for (const pattern of patterns) {
            const hits = [];

            if (visibleTextResult?.text) {
                hits.push(...collectPatternHits(visibleTextResult.text, pattern.regex, 'visible-text', '', maxSnippetLength));
            }

            for (const entry of fieldEntries) {
                hits.push(...collectPatternHits(entry.text, pattern.regex, entry.source, entry.label, maxSnippetLength));
            }

            const dedupedHits = dedupeHits(hits);
            if (!dedupedHits.length) continue;

            matches.push({
                name: pattern.name,
                severity: pattern.severity || 'normal',
                hits: dedupedHits
            });
        }

        return matches;
    }

    function refreshRuntimePatterns() {
        const loadedConfigs = loadPatternConfigs();
        const compiled = compilePatternConfigs(loadedConfigs);

        runtimePatterns = (
            compiled.errors.length === 0
                ? createRuntimePatterns(compiled)
                : getDefaultRuntimePatterns()
        );

        return runtimePatterns;
    }

    function getRuntimePatterns() {
        return runtimePatterns;
    }

    function findRuntimeMatches(visibleTextResult, fieldEntries, maxSnippetLength = CONFIG.maxSnippetLength) {
        return findMatches(visibleTextResult, fieldEntries, runtimePatterns.patterns, maxSnippetLength);
    }

    function formatPatternConfig(config, index) {
        const flags = config.flags || '';
        const severity = config.severity || 'normal';
        return `${index + 1}. ${config.name} /${config.source}/${flags} [${severity}]`;
    }

    function formatPatternConfigList(patternConfigs) {
        if (!Array.isArray(patternConfigs) || patternConfigs.length === 0) {
            return 'No keywords configured.';
        }

        return patternConfigs.map(formatPatternConfig).join('\n');
    }

    function showPromptMessage(promptFn, message) {
        if (typeof promptFn !== 'function') return;
        promptFn(message, '');
    }

    function promptForPatternConfig(existingConfig = null, options = {}) {
        const promptFn = typeof options.prompt === 'function' ? options.prompt : globalThis.prompt;

        if (typeof promptFn !== 'function') return null;

        const current = existingConfig || {};
        const name = promptFn('Keyword name', current.name || '');
        if (name === null) return null;

        const source = promptFn('Regex source', current.source || '');
        if (source === null) return null;

        const flags = promptFn('Regex flags', current.flags || '');
        if (flags === null) return null;

        const severity = promptFn('Severity', current.severity || 'normal');
        if (severity === null) return null;

        const config = {
            name: name.trim(),
            source,
            flags: flags.trim(),
            severity: severity.trim() || 'normal'
        };
        const compiled = compilePatternConfigs([config]);
        if (compiled.errors.length > 0 || compiled.patterns.length !== 1) {
            showPromptMessage(
                promptFn,
                `Invalid regex input. ${compiled.errors[0]?.message || 'Check the keyword fields and try again.'}`
            );
            return null;
        }

        return config;
    }

    function selectPatternConfigIndex(patternConfigs, actionLabel, options = {}) {
        const promptFn = typeof options.prompt === 'function' ? options.prompt : globalThis.prompt;

        if (!Array.isArray(patternConfigs) || patternConfigs.length === 0) {
            showPromptMessage(promptFn, 'No keywords configured.');
            return -1;
        }

        if (typeof promptFn !== 'function') return -1;

        const response = promptFn(
            `${actionLabel}\n\n${formatPatternConfigList(patternConfigs)}\n\nEnter the keyword number:`,
            '1'
        );
        if (response === null) return -1;

        const index = Number.parseInt(String(response).trim(), 10);
        if (!Number.isInteger(index) || index < 1 || index > patternConfigs.length) {
            showPromptMessage(promptFn, 'Invalid keyword number.');
            return -1;
        }

        return index - 1;
    }

    function applyPatternConfigMutation(patternConfigs, options = {}) {
        const savePatternConfigsFn = typeof options.savePatternConfigs === 'function'
            ? options.savePatternConfigs
            : savePatternConfigs;
        const refreshRuntimePatternsFn = typeof options.refreshRuntimePatterns === 'function'
            ? options.refreshRuntimePatterns
            : refreshRuntimePatterns;
        const scheduleScanFn = typeof options.scheduleScan === 'function'
            ? options.scheduleScan
            : scheduleScan;

        savePatternConfigsFn(patternConfigs);
        refreshRuntimePatternsFn();
        scheduleScanFn();
    }

    function createMenuHandlers(options = {}) {
        const loadPatternConfigsFn = typeof options.loadPatternConfigs === 'function'
            ? options.loadPatternConfigs
            : loadPatternConfigs;
        const promptForPatternConfigFn = typeof options.promptForPatternConfig === 'function'
            ? options.promptForPatternConfig
            : promptForPatternConfig;
        const promptFn = typeof options.prompt === 'function' ? options.prompt : globalThis.prompt;
        const confirmFn = typeof options.confirm === 'function' ? options.confirm : globalThis.confirm;
        const selectionOptions = {
            prompt: promptFn
        };
        const mutationOptions = {
            savePatternConfigs: options.savePatternConfigs,
            refreshRuntimePatterns: options.refreshRuntimePatterns,
            scheduleScan: options.scheduleScan
        };

        return {
            listKeywords() {
                showPromptMessage(promptFn, formatPatternConfigList(loadPatternConfigsFn()));
            },
            addKeyword() {
                const patternConfigs = loadPatternConfigsFn();
                const nextConfig = promptForPatternConfigFn(null, {
                    prompt: promptFn
                });
                if (!nextConfig) return;

                applyPatternConfigMutation([...patternConfigs, nextConfig], mutationOptions);
            },
            editKeyword() {
                const patternConfigs = loadPatternConfigsFn();
                const index = selectPatternConfigIndex(patternConfigs, 'Edit keyword', selectionOptions);
                if (index < 0) return;

                const nextConfig = promptForPatternConfigFn(patternConfigs[index], {
                    prompt: promptFn
                });
                if (!nextConfig) return;

                const updatedConfigs = patternConfigs.slice();
                updatedConfigs[index] = nextConfig;
                applyPatternConfigMutation(updatedConfigs, mutationOptions);
            },
            removeKeyword() {
                const patternConfigs = loadPatternConfigsFn();
                const index = selectPatternConfigIndex(patternConfigs, 'Remove keyword', selectionOptions);
                if (index < 0) return;

                const target = patternConfigs[index];
                if (typeof confirmFn === 'function' && !confirmFn(`Remove keyword "${target.name}"?`)) {
                    return;
                }

                const updatedConfigs = patternConfigs.slice();
                updatedConfigs.splice(index, 1);
                applyPatternConfigMutation(updatedConfigs, mutationOptions);
            },
            resetKeywords() {
                if (typeof confirmFn === 'function' && !confirmFn('Reset keywords to defaults?')) {
                    return;
                }

                applyPatternConfigMutation(getDefaultPatternConfigs(), mutationOptions);
            }
        };
    }

    function registerMenuCommands(options = {}) {
        if (options.resetRegistrationState) {
            menuCommandsRegistered = false;
        }

        if (menuCommandsRegistered) return false;

        const registerCommand = typeof options.registerCommand === 'function'
            ? options.registerCommand
            : getTampermonkeyMenuRegistrar();
        if (typeof registerCommand !== 'function') return false;

        const handlers = options.handlers || createMenuHandlers();
        for (const [label, handlerName] of MENU_COMMAND_DEFINITIONS) {
            registerCommand(label, handlers[handlerName]);
        }

        menuCommandsRegistered = true;
        return true;
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${ROOT_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483647;
                pointer-events: none;
                font-family: Arial, sans-serif;
            }

            #${OVERLAY_ID} {
                position: absolute;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 24px;
                background: rgba(19, 14, 11, 0.72);
                pointer-events: auto;
            }

            #${OVERLAY_ID}.is-visible {
                display: flex;
            }

            #${MODAL_ID} {
                width: min(720px, 100%);
                max-height: min(80vh, 900px);
                overflow: auto;
                border: 4px solid #96281b;
                border-radius: 18px;
                background: #fff6f0;
                color: #241913;
                box-shadow: 0 28px 80px rgba(0, 0, 0, 0.35);
            }

            #${MODAL_ID}[data-context="checkout"] {
                border-color: #7a0012;
                background: #fff0f1;
            }

            #${MODAL_ID} header {
                padding: 20px 24px 8px;
            }

            #${TITLE_ID} {
                margin: 0;
                font-size: 28px;
                line-height: 1.1;
            }

            #${MODAL_ID} .tm-keyword-alert__subtitle {
                margin: 10px 0 0;
                font-size: 15px;
                line-height: 1.45;
            }

            #${BODY_ID} {
                padding: 8px 24px 24px;
            }

            #${BODY_ID} .tm-keyword-alert__group {
                margin-top: 16px;
                padding: 14px 16px;
                border-radius: 12px;
                background: rgba(150, 40, 27, 0.08);
            }

            #${MODAL_ID}[data-context="checkout"] #${BODY_ID} .tm-keyword-alert__group {
                background: rgba(122, 0, 18, 0.08);
            }

            #${BODY_ID} .tm-keyword-alert__group-title {
                font-weight: 700;
                font-size: 16px;
            }

            #${BODY_ID} .tm-keyword-alert__hit {
                margin-top: 8px;
                font-size: 14px;
                line-height: 1.4;
                word-break: break-word;
            }

            #${BODY_ID} .tm-keyword-alert__label {
                display: inline-block;
                margin-right: 6px;
                font-weight: 700;
            }

            #${MODAL_ID} footer {
                padding: 0 24px 24px;
            }

            #${DISMISS_ID} {
                width: 100%;
                border: 0;
                border-radius: 12px;
                padding: 14px 18px;
                font-size: 16px;
                font-weight: 700;
                color: #ffffff;
                background: #96281b;
                cursor: pointer;
            }

            #${MODAL_ID}[data-context="checkout"] #${DISMISS_ID} {
                background: #7a0012;
            }
        `;

        document.head.appendChild(style);
    }

    function ensureModalRoot() {
        let root = document.getElementById(ROOT_ID);
        if (root) return root;

        root = document.createElement('div');
        root.id = ROOT_ID;
        root.innerHTML = `
            <div id="${OVERLAY_ID}">
                <section id="${MODAL_ID}" role="dialog" aria-modal="true" aria-labelledby="${TITLE_ID}">
                    <header>
                        <h1 id="${TITLE_ID}"></h1>
                        <p class="tm-keyword-alert__subtitle"></p>
                    </header>
                    <div id="${BODY_ID}"></div>
                    <footer>
                        <button id="${DISMISS_ID}" type="button">Dismiss alert</button>
                    </footer>
                </section>
            </div>
        `;

        document.documentElement.appendChild(root);

        const dismissButton = document.getElementById(DISMISS_ID);
        dismissButton?.addEventListener('click', () => {
            dismissedFingerprint = currentFingerprint;
            hideModal();
        });

        const overlay = document.getElementById(OVERLAY_ID);
        overlay?.addEventListener('click', event => {
            if (event.target !== overlay) return;
            dismissedFingerprint = currentFingerprint;
            hideModal();
        });

        return root;
    }

    function renderMatchGroups(matches) {
        return matches.map(match => {
            const hits = match.hits.map(hit => {
                const label = hit.label ? `<span class="tm-keyword-alert__label">${escapeHtml(hit.label)}:</span>` : '';
                return `<div class="tm-keyword-alert__hit">${label}${escapeHtml(hit.snippet)}</div>`;
            }).join('');

            return `
                <section class="tm-keyword-alert__group">
                    <div class="tm-keyword-alert__group-title">${escapeHtml(match.name)}</div>
                    ${hits}
                </section>
            `;
        }).join('');
    }

    function getAlertContent(context) {
        if (context.isCheckoutLike) {
            return {
                title: 'Keyword match warning on a high-risk page',
                subtitle: 'Configured patterns matched on a page that looks related to checkout, orders, billing, shipping, profile management, or account changes.'
            };
        }

        return {
            title: 'Keyword match warning',
            subtitle: 'Configured patterns matched visible page text or editable fields on this page.'
        };
    }

    function showModal(matches, context, fingerprint) {
        injectStyles();
        ensureModalRoot();

        const overlay = document.getElementById(OVERLAY_ID);
        const modal = document.getElementById(MODAL_ID);
        const title = document.getElementById(TITLE_ID);
        const subtitle = modal?.querySelector('.tm-keyword-alert__subtitle');
        const body = document.getElementById(BODY_ID);

        if (!overlay || !modal || !title || !subtitle || !body) return;

        currentFingerprint = fingerprint;
        modal.dataset.context = context.isCheckoutLike ? 'checkout' : 'generic';
        const alertContent = getAlertContent(context);
        title.textContent = alertContent.title;
        subtitle.textContent = alertContent.subtitle;
        body.innerHTML = renderMatchGroups(matches);
        overlay.classList.add('is-visible');
    }

    function hideModal() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) {
            overlay.classList.remove('is-visible');
        }
    }

    function runScan() {
        if (scanInProgress) {
            rescanRequested = true;
            return;
        }

        scanInProgress = true;

        try {
            const visibleText = collectVisibleText();
            const fieldEntries = collectEditableFieldText();
            const context = detectCheckoutContext(window.location.href, visibleText.text);
            const matches = findRuntimeMatches(visibleText, fieldEntries);

            if (!matches.length) {
                currentFingerprint = '';
                dismissedFingerprint = '';
                hideModal();
                return;
            }

            const fingerprint = buildMatchFingerprint(matches, context);
            if (fingerprint === dismissedFingerprint) return;
            if (fingerprint === currentFingerprint) return;

            showModal(matches, context, fingerprint);
        } finally {
            scanInProgress = false;

            if (rescanRequested) {
                rescanRequested = false;
                scheduleScan();
            }
        }
    }

    function scheduleScan() {
        if (scanTimer) {
            window.clearTimeout(scanTimer);
        }

        scanTimer = window.setTimeout(() => {
            scanTimer = null;
            runScan();
        }, CONFIG.rescanDebounceMs);
    }

    function observeDocument() {
        if (observer || !document.body) return;

        observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.target instanceof Element && mutation.target.closest?.(`#${ROOT_ID}`)) {
                    continue;
                }

                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    scheduleScan();
                    return;
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function observeInputs() {
        document.addEventListener('input', event => {
            if (!(event.target instanceof HTMLElement)) return;
            if (!event.target.matches('input, textarea, select')) return;
            scheduleScan();
        }, true);

        document.addEventListener('change', event => {
            if (!(event.target instanceof HTMLElement)) return;
            if (!event.target.matches('input, textarea, select')) return;
            scheduleScan();
        }, true);
    }

    function observeNavigation() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function pushState(...args) {
            const result = originalPushState.apply(this, args);
            scheduleScan();
            return result;
        };

        history.replaceState = function replaceState(...args) {
            const result = originalReplaceState.apply(this, args);
            scheduleScan();
            return result;
        };

        window.addEventListener('popstate', scheduleScan);
        window.addEventListener('hashchange', scheduleScan);
    }

    function init() {
        if (!document.body || !document.head) return;

        refreshRuntimePatterns();
        registerMenuCommands();
        scheduleScan();
        observeDocument();
        observeInputs();
        observeNavigation();
    }

    const api = {
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
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init, { once: true });
        } else {
            init();
        }
    }
})();
