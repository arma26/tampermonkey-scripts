# Keyword Alert Design

## Goal

Create a Tampermonkey userscript that runs on all webpages, detects configured regex matches in visible page text and editable form fields, and shows an unmistakable popup when matches are found.

## Scope

- Runs on all webpages.
- Uses user-authored JavaScript regular expressions.
- Scans visible page text plus editable form values.
- Shows a blocking modal popup when configured patterns match.
- Applies stronger styling and wording on high-risk pages such as checkout, order, billing, shipping, and profile-management flows.
- Tolerates SPA updates and infinite-scroll DOM churn without throwing errors or reopening the same alert endlessly.

## Non-Goals

- No site-specific integrations.
- No attempt to comprehensively support cross-origin iframes.
- No storage-backed configuration UI in v1.
- No special infinite-scroll feature behavior beyond safe, bounded rescanning.

## Recommended Approach

Use a general DOM text scanner plus editable field watcher. This satisfies the requirement to work on all webpages while staying simpler and less brittle than site-specific logic. The design relies on defensive DOM access, debounced rescans, and match fingerprinting to avoid noisy repeated alerts on modern SPA pages.

## User Configuration

Built-in defaults stay in a top-level constant inside the userscript, but the live pattern list is stored in Tampermonkey storage and managed through menu commands.

Proposed configuration shape:

```js
const CONFIG = {
    defaultPatterns: [
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
```

Notes:

- Default patterns live in code only as fallback values.
- Stored patterns use serializable objects such as `{ name, source, flags, severity }`.
- Runtime matching compiles stored objects into `RegExp` instances.
- Pattern names are used in the popup so matches can be understood quickly.
- Severity is optional for v1 but useful if a stronger presentation is needed later.

## Menu-Based Pattern Management

The script adds a minimal Tampermonkey menu system so match targets can be changed without editing the script file.

Required grants:

- `GM_getValue`
- `GM_setValue`
- `GM_registerMenuCommand`

Menu commands:

- `List keywords`
- `Add keyword`
- `Edit keyword`
- `Remove keyword`
- `Reset keywords to defaults`

Interaction model:

- Each command uses `prompt()` and `confirm()` only.
- `Add` and `Edit` collect `name`, `source`, `flags`, and optional `severity`.
- Pattern-entry prompts include short static instructions and examples for each field.
- The flags prompt explains the common regex flags `i`, `g`, and `m`, and shows that blank is allowed.
- `List` shows the current stored patterns in a readable text block.
- `Remove` selects an existing pattern by number or exact name.
- `Reset` replaces stored patterns with the built-in defaults after confirmation.

Validation rules:

- Patterns are stored as plain data, never as raw `RegExp` objects.
- New or edited patterns are compiled immediately to validate them before saving.
- Invalid patterns are rejected with an alert and do not replace the stored configuration.
- If stored patterns are missing or malformed, the script falls back to defaults rather than crashing.

## Detection Rules

The script evaluates matches against two sources:

1. Visible page text from rendered DOM content.
2. Current values from editable fields:
   - `input`
   - `textarea`
   - selected option text from `select`

The script explicitly ignores:

- hidden inputs
- password fields
- payment-related inputs where feasible
- `script`, `style`, and other non-visible DOM content
- collapsed or invisible elements

Matching behavior:

- Regexes are executed against normalized text.
- Results are grouped by configured pattern name.
- The popup shows compact snippets instead of every raw occurrence.

## Page Classification

The script distinguishes between generic pages and checkout-like pages.

Checkout-like context is inferred from:

- URL patterns such as `checkout`, `cart`, `shipping`, `billing`, `order`, `profile`, `account`
- visible labels such as `shipping`, `delivery`, `place order`, `billing`, `account`

This classification affects presentation only. The scanner still runs globally.

## Alert Behavior

- On any page with a match, show a blocking modal popup.
- On checkout-like or other high-risk pages, use stronger styling and wording.
- The modal lists:
  - the pattern name
  - short snippets showing what matched
  - a dismiss control
- The same match set should not reopen repeatedly for the same page state.

## Architecture

Recommended functions:

- `collectVisibleText()`
  - Walk visible DOM content and extract normalized text.
  - Stop once the configured character budget is reached.
- `collectEditableFieldText()`
  - Read current values from editable fields and selected option text.
- `detectCheckoutContext()`
  - Score the page using URL patterns and visible labels.
- `findMatches()`
  - Execute compiled runtime regexes against collected sources and return structured matches.
- `buildMatchFingerprint()`
  - Create a stable representation of the current match set to suppress duplicate popups.
- `showModal()`
  - Render the blocking overlay and populate grouped match details.
- `scheduleScan()`
  - Debounce rescans from DOM mutations, navigation changes, and field edits.
- `loadPatternConfigs()`
  - Load serializable pattern data from Tampermonkey storage or fallback defaults.
- `compilePatternConfigs()`
  - Validate and transform stored pattern data into runtime `RegExp` objects.
- `registerMenuCommands()`
  - Register Tampermonkey menu actions for listing and mutating stored patterns.

## Performance and Stability

The script must not treat infinite scrolling as a feature to support, but it must remain stable when exposed to it.

Guardrails:

- Use a debounced `MutationObserver`.
- Bound each scan with a maximum text collection budget.
- Use defensive DOM access with early returns when nodes disappear during scanning.
- Reuse modal DOM where possible instead of rebuilding aggressively.
- Avoid repeated alerts through match fingerprinting.

Expected behavior on infinite-scroll pages:

- The script may rescan occasionally as content changes.
- It should not throw errors if nodes are added or removed mid-scan.
- It should not spin in tight loops or reopen the same alert endlessly.

## Known Limitations

- Cross-origin iframes may contain matching text the script cannot inspect.
- Aggressive regexes can overmatch and create noise.
- Some sites render state in inaccessible shadow DOM or inside components that are difficult to classify perfectly.
- Tampermonkey menu commands are browser-only and require manual validation in the extension UI.

## Testing Strategy

This repo favors scenario-based validation over test infrastructure for userscripts.

Primary scenarios:

1. A configured target phrase appears in plain visible text on a generic page and triggers the popup.
2. A configured target phrase is entered or autofilled into an editable field and triggers the popup.
3. A non-matching page does not alert.
4. A SPA checkout updates a matching block after initial load and still triggers the popup.
5. Repeated DOM churn does not reopen the same popup endlessly.
6. Checkout-like pages use stronger wording and styling than generic pages.
7. Infinite-scroll-like DOM changes do not cause exceptions or runaway rescans.
8. Adding, editing, removing, and resetting keywords through the Tampermonkey menu updates the active pattern set without editing the script.

## Implementation Notes

- Keep the script standalone at repo root like the existing userscripts.
- Use the filename `keyword-alert.js`.
- Preserve Tampermonkey metadata block style used in the repo.
- Update `readme.md` when the script is added because repo instructions require documentation updates for new scripts.
