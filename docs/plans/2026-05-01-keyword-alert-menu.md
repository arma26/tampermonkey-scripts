# Keyword Alert Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Tampermonkey menu system that lets the user list, add, edit, remove, and reset stored keyword patterns without modifying `keyword-alert.js`.

**Architecture:** Keep built-in default patterns in `keyword-alert.js`, but move the live pattern set into Tampermonkey storage via `GM_getValue` and `GM_setValue`. Add prompt-driven menu commands through `GM_registerMenuCommand`, compile stored `{ name, source, flags, severity }` objects into runtime regexes, and feed those compiled patterns into the existing matcher and rescan flow.

**Tech Stack:** Plain JavaScript, Tampermonkey GM APIs, browser DOM APIs, Node test runner (`node:test`)

---

### Task 1: Add Storage and Compilation Tests

**Files:**
- Modify: `tests/keyword-alert.test.js`
- Reference: `keyword-alert.js`

**Step 1: Write the failing test for compiling stored pattern configs**

Add a test like:

```js
test('compilePatternConfigs converts stored configs into runtime regexes', () => {
    const compiled = compilePatternConfigs([
        { name: 'Phrase', source: 'alpha target', flags: 'i', severity: 'high' }
    ]);

    assert.equal(compiled.length, 1);
    assert.equal(compiled[0].name, 'Phrase');
    assert.equal(compiled[0].regex.test('ALPHA TARGET'), true);
});
```

**Step 2: Write the failing test for invalid regex rejection**

Add a test like:

```js
test('compilePatternConfigs reports invalid regex configs', () => {
    const result = compilePatternConfigs([
        { name: 'Broken', source: '(', flags: '' }
    ]);

    assert.equal(result.patterns.length, 0);
    assert.equal(result.errors.length, 1);
});
```

**Step 3: Run test to verify it fails**

Run:

```bash
node --test tests/keyword-alert.test.js
```

Expected: FAIL because `compilePatternConfigs` is not exported or does not exist yet.

**Step 4: Commit**

```bash
git add tests/keyword-alert.test.js
git commit -m "test: cover stored keyword pattern compilation"
```

### Task 2: Add Pattern Storage Helpers

**Files:**
- Modify: `keyword-alert.js`
- Test: `tests/keyword-alert.test.js`

**Step 1: Add default pattern config helpers**

Introduce:

```js
function getDefaultPatternConfigs() {
    return [
        { name: 'Target Phrase', source: 'example phrase', flags: 'i', severity: 'high' },
        { name: 'Target Code', source: '\\b4242\\b', flags: 'i', severity: 'high' }
    ];
}
```

Update the static config so defaults are represented as serializable pattern data rather than prebuilt `RegExp` objects.

**Step 2: Add `compilePatternConfigs()`**

Return shape:

```js
function compilePatternConfigs(configs) {
    return {
        patterns: [
            { name: 'Phrase', regex: /alpha target/i, severity: 'high', source: 'alpha target', flags: 'i' }
        ],
        errors: []
    };
}
```

Rules:

- reject malformed entries
- catch `RegExp` constructor errors
- do not throw for user data problems

**Step 3: Add load/save helpers**

Implement:

- `loadPatternConfigs()`
- `savePatternConfigs()`

Behavior:

- use Tampermonkey storage when available
- fallback to defaults if storage is empty or invalid
- store plain objects only

**Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/keyword-alert.test.js
```

Expected: PASS for the new compilation tests and all existing tests.

**Step 5: Commit**

```bash
git add keyword-alert.js tests/keyword-alert.test.js
git commit -m "feat: add stored keyword pattern helpers"
```

### Task 3: Connect Runtime Matching to Stored Patterns

**Files:**
- Modify: `keyword-alert.js`
- Test: `tests/keyword-alert.test.js`

**Step 1: Write the failing test for runtime fallback behavior**

Add a test like:

```js
test('getRuntimePatterns falls back to defaults when stored configs are invalid', () => {
    const runtime = getRuntimePatterns([
        { name: 'Broken', source: '(', flags: '' }
    ]);

    assert.equal(runtime.patterns.length > 0, true);
    assert.equal(runtime.errors.length, 1);
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/keyword-alert.test.js
```

Expected: FAIL because `getRuntimePatterns` is not implemented yet.

**Step 3: Implement runtime pattern state**

Add helpers or state such as:

- `getRuntimePatterns()`
- `refreshRuntimePatterns()`

Update scanning so:

- matching uses compiled runtime patterns from storage-backed state
- reset/add/edit/remove operations can refresh the active runtime pattern list
- invalid stored data falls back to defaults and logs warnings

**Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/keyword-alert.test.js
```

Expected: PASS.

**Step 5: Commit**

```bash
git add keyword-alert.js tests/keyword-alert.test.js
git commit -m "feat: use storage-backed runtime keyword patterns"
```

### Task 4: Add Tampermonkey Menu Commands

**Files:**
- Modify: `keyword-alert.js`

**Step 1: Update metadata grants**

Add:

```js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
```

**Step 2: Implement menu helpers**

Add focused helpers:

- `listPatternConfigs()`
- `promptForPatternConfig(existingConfig)`
- `addPatternConfig()`
- `editPatternConfig()`
- `removePatternConfig()`
- `resetPatternConfigs()`
- `registerMenuCommands()`

Requirements:

- use guard clauses for user cancellation
- validate regex during add/edit before saving
- select edit/remove targets by indexed list shown in `prompt()`

**Step 3: Integrate menu registration into init**

Ensure menu commands are registered once and that successful mutations:

- save to Tampermonkey storage
- refresh runtime patterns
- schedule a rescan

**Step 4: Manual browser verification**

In Tampermonkey, verify:

1. `List keywords` shows the current stored items.
2. `Add keyword` persists a new pattern across reloads.
3. `Edit keyword` updates an existing pattern.
4. `Remove keyword` deletes the chosen pattern.
5. `Reset keywords to defaults` restores built-in defaults.
6. Invalid regex input is rejected without breaking the script.

Expected: no console exceptions and visible menu entries under the script.

**Step 5: Commit**

```bash
git add keyword-alert.js
git commit -m "feat: add Tampermonkey menu commands for keyword patterns"
```

### Task 5: Final Docs and Verification

**Files:**
- Modify: `readme.md`
- Verify: `keyword-alert.js`
- Verify: `tests/keyword-alert.test.js`

**Step 1: Update README**

Document:

- that keywords are stored outside the script body in Tampermonkey storage
- available menu commands
- that regexes are stored as `source` plus `flags`

**Step 2: Run syntax and tests**

Run:

```bash
node --check keyword-alert.js
node --test tests/keyword-alert.test.js
```

Expected: both succeed.

**Step 3: Review for accidental machine-specific paths or PII**

Check the diff to ensure no local absolute paths were introduced into committed files.

**Step 4: Commit**

```bash
git add keyword-alert.js tests/keyword-alert.test.js readme.md
git commit -m "docs: add keyword menu usage notes"
```
