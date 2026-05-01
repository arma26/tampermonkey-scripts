# Keyword Alert Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Tampermonkey userscript that scans visible page text and editable form fields for configured regex matches and shows a blocking popup, with stronger treatment on high-risk pages.

**Architecture:** Add one standalone userscript at repo root with a small set of focused helpers for text collection, page classification, matching, modal rendering, and debounced rescanning. Keep configuration in a top-level constant and validate behavior through scenario-based manual checks rather than adding test infrastructure that the repo does not currently use.

**Tech Stack:** Plain JavaScript, Tampermonkey userscript metadata, browser DOM APIs, `MutationObserver`, `requestAnimationFrame`

---

### Task 1: Scaffold the Userscript

**Files:**
- Create: `keyword-alert.js`
- Modify: `readme.md`
- Reference: `amazon-tools.js`

**Step 1: Create the metadata block and config skeleton**

Write `keyword-alert.js` with:

```js
// ==UserScript==
// @name         Keyword Alert
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Alert when configured keyword regexes appear on webpages
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        patterns: [
            { name: 'Target Phrase', regex: /example phrase/i, severity: 'high' }
        ],
        checkoutSignals: {
            url: [/checkout/i, /cart/i, /order/i, /shipping/i, /billing/i, /profile/i, /account/i],
            text: [/place order/i, /shipping/i, /delivery/i, /billing/i, /account/i]
        },
        rescanDebounceMs: 250,
        maxCollectedTextLength: 50000,
        maxSnippetLength: 160
    };
})();
```

**Step 2: Update the repo documentation**

Add a short section to `readme.md` describing:

- the script purpose
- global matching behavior
- regex-based configuration

**Step 3: Review for style consistency**

Check that:

- indentation matches repo style
- ASCII-only content is preserved
- the metadata block follows existing scripts

**Step 4: Commit**

```bash
git add keyword-alert.js readme.md
git commit -m "feat: scaffold keyword alert userscript"
```

### Task 2: Implement Text Collection Helpers

**Files:**
- Modify: `keyword-alert.js`

**Step 1: Add a failing manual scenario note in comments**

Add a short comment block near the helper section:

```js
// Scenario target:
// - visible matching text should be collected
// - hidden/script/style content should be ignored
```

This is not a substitute for testing; it is a guardrail for implementation in a repo without automated tests for userscripts.

**Step 2: Implement `collectVisibleText()`**

Write a helper that:

- walks the DOM using `TreeWalker`
- only includes visible text nodes
- skips nodes inside `script`, `style`, `noscript`
- trims and normalizes whitespace
- stops when `CONFIG.maxCollectedTextLength` is reached

Expected shape:

```js
function collectVisibleText() {
    return {
        text: '...',
        snippets: ['...']
    };
}
```

**Step 3: Implement `collectEditableFieldText()`**

Read values from:

- text-like `input`
- `textarea`
- selected option text from `select`

Exclude:

- hidden inputs
- password inputs
- empty values

Expected shape:

```js
function collectEditableFieldText() {
    return [
        { source: 'input', label: 'Primary field', text: '...' }
    ];
}
```

**Step 4: Manually verify in browser**

Load the draft script in Tampermonkey and verify on a simple test page that:

- visible text is collected
- typing a configured regex match into an input would be seen by the helper path

Expected: no runtime errors in the console.

**Step 5: Commit**

```bash
git add keyword-alert.js
git commit -m "feat: collect visible text and editable field values"
```

### Task 3: Implement Matching and Context Detection

**Files:**
- Modify: `keyword-alert.js`

**Step 1: Implement `detectCheckoutContext()`**

Use:

- `window.location.href`
- visible text summary from `collectVisibleText()`

Return a small object:

```js
function detectCheckoutContext(visibleText) {
    return {
        isCheckoutLike: false,
        reasons: []
    };
}
```

**Step 2: Implement `findMatches()`**

Apply each configured regex against:

- visible text
- collected field text

Return grouped structured output:

```js
function findMatches(visibleText, fieldEntries) {
    return [
        {
            name: 'Old Street',
            severity: 'high',
            hits: [
                { source: 'visible-text', snippet: 'Ship to 123 Old Street...' }
            ]
        }
    ];
}
```

**Step 3: Add snippet truncation and grouping**

Ensure:

- snippets are capped by `CONFIG.maxSnippetLength`
- repeated identical hits are deduplicated
- empty match sets return early

**Step 4: Manually verify**

Check scenarios:

- generic page with matching text
- non-matching page
- checkout-like URL with matching text

Expected: context classification changes while matching remains stable.

**Step 5: Commit**

```bash
git add keyword-alert.js
git commit -m "feat: add regex matching and checkout context detection"
```

### Task 4: Implement the Blocking Modal

**Files:**
- Modify: `keyword-alert.js`

**Step 1: Add modal styles and DOM creation**

Create:

- overlay
- modal container
- title/body sections
- dismiss button

Use stronger text/styling when `isCheckoutLike` is true.

**Step 2: Implement `showModal()`**

Render:

- page-context-aware heading
- grouped pattern names
- short snippets for each matched pattern

Guard against duplicate modal creation by reusing existing DOM.

**Step 3: Implement dismiss behavior**

Dismiss should:

- hide the modal cleanly
- preserve the latest match fingerprint so the same state does not immediately reopen

**Step 4: Manually verify**

Check:

- popup is unmistakable on generic pages
- popup is stronger on checkout-like pages
- dismiss works

Expected: one modal at a time, no duplicate overlays.

**Step 5: Commit**

```bash
git add keyword-alert.js
git commit -m "feat: add blocking alert modal for keyword matches"
```

### Task 5: Add Rescanning, SPA Tolerance, and Infinite-Scroll Safety

**Files:**
- Modify: `keyword-alert.js`

**Step 1: Implement `buildMatchFingerprint()`**

Create a stable string from:

- matched pattern names
- snippets or normalized hit identifiers
- checkout-context state

**Step 2: Implement `runScan()` and `scheduleScan()`**

`runScan()` should:

- collect visible text
- collect field values
- detect page context
- find matches
- compare fingerprint
- show or suppress the modal accordingly

`scheduleScan()` should:

- debounce with `setTimeout`
- avoid overlapping scans

**Step 3: Attach observers and listeners**

Add:

- `MutationObserver` on `document.body`
- `input` and `change` listeners
- initial load trigger

All DOM access must use guard clauses so disappearing nodes do not throw.

**Step 4: Manual stability verification**

Test on:

- a SPA that updates sections after load
- a page with frequent DOM additions

Expected:

- no console exceptions
- no rapid popup loop
- no obvious runaway CPU behavior

**Step 5: Commit**

```bash
git add keyword-alert.js
git commit -m "feat: add debounced rescanning and duplicate alert suppression"
```

### Task 6: Final Documentation and Verification

**Files:**
- Modify: `readme.md`
- Verify: `keyword-alert.js`

**Step 1: Finalize the README entry**

Document:

- what the script scans
- how to edit regex patterns
- checkout-context behavior
- limitation around cross-origin iframes

**Step 2: Run a syntax check**

Run:

```bash
node --check keyword-alert.js
```

Expected: no syntax errors.

**Step 3: Run scenario-based manual verification**

Verify these scenarios in the browser:

1. Matching visible text triggers popup.
2. Matching editable field value triggers popup.
3. Non-matching page stays quiet.
4. Checkout-like page uses stronger styling.
5. Repeated DOM churn does not reopen the same popup endlessly.
6. Infinite-scroll-like updates do not throw errors.

**Step 4: Review git diff for accidental machine-specific paths**

Check that no fully qualified local paths or other PII leaked into tracked files.

**Step 5: Commit**

```bash
git add keyword-alert.js readme.md
git commit -m "docs: finalize keyword alert usage notes"
```
