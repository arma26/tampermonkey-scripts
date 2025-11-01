// ==UserScript==
// @name         HumbleBundle Key Collector
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  Collects HumbleBundle product keys, saves them in localStorage, and provides menu commands.
// @match        https://www.humblebundle.com/*
// @grant        GM_registerMenuCommand
// @author       arma26
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'humble_keys_collected';

let keyCount = 0; // Tracks the number of keys in memory

// Load keys and update keyCount
function loadKeys() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        const parsed = data ? JSON.parse(data) : {};

        // Check for size decrease
        if (Object.keys(parsed).length < keyCount) {
            console.log(`[HBK] Key collection size decreased from ${keyCount} to ${Object.keys(parsed).length}`);
        }

        keyCount = Object.keys(parsed).length; // Update in-memory count
        return parsed;
    } catch (e) {
        console.error('[HBK] Failed to load keys:', e);
        keyCount = 0;
        return {};
    }
}

// Save keys and update keyCount
function saveKeys(keys) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(keys, null, 2));
        keyCount = Object.keys(keys).length; // Update in-memory count
        console.log(`[HBK] Saved keys. Collection size is now ${keyCount}`);
    } catch (e) {
        console.error('[HBK] Failed to save keys:', e);
    }
}


    function clearKeys() {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[HBK] Cleared all stored keys.');
        alert('All saved Humble keys have been cleared.');
    }

    function dumpHumbleKeys() {
        const keys = loadKeys();
        console.log('[HBK] Dumped keys:', keys);
        alert(Object.keys(keys).length
            ? `Stored ${Object.keys(keys).length} keys. See console for details.`
            : 'No keys stored yet.');
    }

    function exportKeysAsJSON() {
        const keys = loadKeys();
        const blob = new Blob([JSON.stringify(keys, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'humble_keys.json';
        a.click();
        URL.revokeObjectURL(url);
        console.log('[HBK] Exported keys as humble_keys.json');
    }

    // -------------------------------
    // Extract game name from row
    // -------------------------------
    function extractGameName(container) {
        const row = container.closest('tr');
        if (row) {
            const gameCell = row.querySelector('td.game-name');
            if (gameCell) {
                const titleEl = gameCell.querySelector('h4[title]') || gameCell.querySelector('h4');
                const linkEl = gameCell.querySelector('a');
                const name =
                    (titleEl && titleEl.getAttribute('title')) ||
                    (titleEl && titleEl.textContent.trim()) ||
                    (linkEl && linkEl.textContent.trim()) ||
                    gameCell.textContent.trim();
                if (name) return name;
            }
        }

        const fallback =
            container.closest('.key-list-entry')?.querySelector('.key-list-row-title, .game-name, h4');
        return fallback ? fallback.textContent.trim() : 'Unknown Game';
    }

// -------------------------------
// Process a single key field
// -------------------------------
function processKeyField(node) {
    if (!node) return;
    const keyValueEl = node.querySelector('.keyfield-value');
    if (!keyValueEl) return;

    const key = keyValueEl.textContent.trim();

    // Skip invalid keys or placeholders
    if (!key || key === 'Reveal your Steam key' || !/^[A-Z0-9-]{5,}$/.test(key)) {
        return;
    }

    const gameName = extractGameName(node);
    const keys = loadKeys();

    // Only add new keys
    if (keys[gameName] !== key) {
        keys[gameName] = key;
        saveKeys(keys);
        console.log(`[HBK] New key added for "${gameName}": ${key}`);
    }
}


    // -------------------------------
    // Mutation observer for new keys
    // -------------------------------
    function setupKeyObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (!(node instanceof HTMLElement)) return;
                    if (node.classList.contains('js-keyfield')) processKeyField(node);
                    node.querySelectorAll?.('.js-keyfield').forEach(processKeyField);
                });
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        console.log('[HBK] Observer active immediately.');
    }

    // -------------------------------
    // Initial scan for already-visible keys
    // -------------------------------
    function initialScan() {
        document.querySelectorAll('.js-keyfield').forEach(processKeyField);
        console.log('[HBK] Initial scan complete.');
    }

    // -------------------------------
    // Register Tampermonkey menu commands
    // -------------------------------
    function registerMenuCommands() {
        GM_registerMenuCommand('Dump Keys to Console', dumpHumbleKeys);
        GM_registerMenuCommand('Export Keys (JSON)', exportKeysAsJSON);
        GM_registerMenuCommand('Clear Saved Keys', clearKeys);
        GM_registerMenuCommand('Reveal All Steam Keys', revealAllKeys);
        GM_registerMenuCommand('Show Stored Keys (Alert)', () => {
            const keys = loadKeys();
            const summary = Object.entries(keys)
                .map(([game, key]) => `${game}: ${key}`)
                .join('\n\n');
            alert(summary || 'No keys saved yet.');
        });
        console.log('[HBK] Menu commands registered.');
    }


// Function to click all unrevealed Steam keys
function revealAllKeys() {
    const placeholders = Array.from(document.querySelectorAll('.js-keyfield .keyfield-value'))
        .filter(el => el.textContent.trim() === 'Reveal your Steam key');

    if (placeholders.length === 0) {
        alert('No unrevealed keys found.');
        return;
    }

    console.log(`[HBK] Revealing ${placeholders.length} keys...`);

    placeholders.forEach(el => {
        const container = el.closest('.js-keyfield');
        if (container) {
            // The clickable element is usually the "Reveal" div inside container
            const revealButton = container.querySelector('a, button, div');
            if (revealButton) {
                revealButton.click(); // trigger key reveal
            }
        }
    });
    console.log(`[HBK] Revealing finished.`);
}


    // -------------------------------
    // Run everything after page fully loads
    // -------------------------------
    window.addEventListener('load', () => {
        console.log('[HBK] Page fully loaded. Starting collector...');
        initialScan();
        setupKeyObserver();
        registerMenuCommands();
    });
})();
