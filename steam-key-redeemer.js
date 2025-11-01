// ==UserScript==
// @name         Steam Key Auto Redeemer
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Redeem Steam keys via UI JSON, auto-check SSA, click Continue, skip owned keys, and persist redeemed keys in localStorage
// @author       arma26
// @match        *://store.steampowered.com/account/registerkey*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const REDEEMED_KEY = "steam_redeemer_redeemed";
    const USER_KEYS = "steam_redeemer_keys";

    let redeemed = JSON.parse(localStorage.getItem(REDEEMED_KEY)) || {};
    let userKeys = JSON.parse(localStorage.getItem(USER_KEYS)) || [];

    function saveRedeemed() {
        localStorage.setItem(REDEEMED_KEY, JSON.stringify(redeemed));
    }

    function saveUserKeys() {
        localStorage.setItem(USER_KEYS, JSON.stringify(userKeys));
    }

    // Floating container for all buttons (bottom-right)
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '10px';
    container.style.right = '10px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column-reverse';
    container.style.gap = '10px';
    container.style.zIndex = 10000;
    document.body.appendChild(container);

    // Debug box container
    const debugBox = document.createElement('div');
    debugBox.id = 'steam_key_debug_box';
    debugBox.style.position = 'fixed';
    debugBox.style.bottom = '120px';
    debugBox.style.right = '10px';
    debugBox.style.width = '280px';
    debugBox.style.maxHeight = '200px';
    debugBox.style.overflowY = 'auto';
    debugBox.style.background = 'rgba(30, 30, 30, 0.9)';
    debugBox.style.color = '#d0d0d0';
    debugBox.style.fontSize = '12px';
    debugBox.style.padding = '8px';
    debugBox.style.borderRadius = '6px';
    debugBox.style.border = '1px solid #555';
    debugBox.style.fontFamily = 'monospace';
    debugBox.style.zIndex = 10001;
    debugBox.innerHTML = '<b>Steam Key Debug Log</b><br>';
    document.body.appendChild(debugBox);

    const MAX_LOG_ENTRIES = 8;

    function logDebug(message, status = '') {
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        let color = '#ccc';
        if (status === 'owned') color = '#4caf50';
        else if (status === 'too_many_attempts') color = '#ff9800';
        else if (status === 'unknown') color = '#999';
        else if (status === 'error') color = '#f44336';
        entry.style.color = color;
        entry.textContent = `[${time}] ${message}`;
        debugBox.appendChild(entry);

        // Limit total entries
        while (debugBox.childNodes.length > MAX_LOG_ENTRIES + 1) {
            debugBox.removeChild(debugBox.childNodes[1]);
        }

        // Auto-scroll to bottom
        debugBox.scrollTop = debugBox.scrollHeight;
    }

    // Find Continue button
    function findContinueButton() {
        const elements = Array.from(document.querySelectorAll('button, span'));
        return elements.find(el => el.innerText.trim() === "Continue");
    }


// Update the logic for getting the next untested key (including retrying keys with 'too_many_attempts')
function getNextUntestedKey() {
    // Skip keys that are already marked as "owned"
    return userKeys.find(k => !(k in redeemed) || redeemed[k] === 'too_many_attempts');
}

async function redeemKey(key, button) {
    if (!key) {
        logDebug("No untested keys available.", "error");
        alert("No untested keys available.");
        return;
    }

    const input = document.querySelector('#product_key');
    const checkbox = document.querySelector('#accept_ssa');
    const continueBtn = findContinueButton();

    if (!input || !checkbox || !continueBtn) {
        logDebug("Missing form elements.", "error");
        return;
    }

    // Disable button while working
    if (button) {
        button.disabled = true;
        button.textContent = "Processing...";
        button.style.opacity = "0.6";
    }

    input.value = key;
    checkbox.checked = true;
    continueBtn.click();
    logDebug(`Submitted key: ${key}`);

    await new Promise(r => setTimeout(r, 3000)); // wait for page change or result
    const bodyText = document.body.innerText;

    // Handle "Too many attempts"
    if (/too many recent activation attempts/i.test(bodyText)) {
        redeemed[key] = "too_many_attempts";
        saveRedeemed();
        logDebug(`Key ${key}: too many attempts`, "too_many_attempts");
        alert("Too many activation attempts. Please try again later.");
    }

    // Handle "Already owns the product"
    else if (/already owns the product/i.test(bodyText)) {
        redeemed[key] = "owned";
        saveRedeemed();
        logDebug(`Key ${key}: already owned`, "owned");
    }

    // Otherwise assume success
    else {
        redeemed[key] = "owned";
        saveRedeemed();
        logDebug(`Key ${key}: activation successful`, "owned");
    }

    // Re-enable button when done
    if (button) {
        button.disabled = false;
        button.textContent = "Redeem Next Key";
        button.style.opacity = "1";
    }

    // Prepare next key automatically in the field
    const nextKey = getNextUntestedKey();
    if (nextKey) {
        input.value = nextKey;
        checkbox.checked = true;
        logDebug(`Prepared next key: ${nextKey}`);
    } else {
        input.value = "";
        logDebug("No more untested keys available.");
    }
}
function addRedeemNextKeyButton() {
    const checkboxContainer = document.querySelector('#accept_ssa')?.parentNode;
    if (!checkboxContainer) return;

    const btn = document.createElement('button');
    btn.textContent = 'Redeem Next Key';
    btn.style.padding = '8px 12px';
    btn.style.fontSize = '14px';
    btn.style.borderRadius = '6px';
    btn.style.background = '#5c7e10';
    btn.style.color = 'white';
    btn.style.border = 'none';
    btn.style.cursor = 'pointer';
    btn.style.marginTop = '8px';
    btn.onclick = async () => {
        const key = getNextUntestedKey();
        if (key) {
            await redeemKey(key, btn);
        } else {
            alert("No untested keys available.");
        }
    };

    checkboxContainer.appendChild(btn);
}

addRedeemNextKeyButton();

})();
