// ==UserScript==
// @name         Steam Key Manual Redeemer
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Redeem one Steam key at a time manually; handles backups and key tracking
// @match        *://store.steampowered.com/account/registerkey*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const REDEEMED_KEY_STORAGE = 'steam_keys_redeemed';
    const KEY_QUEUE_STORAGE = 'steam_keys_queue';

    let redeemedKeys = JSON.parse(localStorage.getItem(REDEEMED_KEY_STORAGE) || '[]');
    let keyQueue = JSON.parse(localStorage.getItem(KEY_QUEUE_STORAGE) || '[]');
    let redeemingInProgress = false;

    function saveRedeemedKeys() {
        localStorage.setItem(REDEEMED_KEY_STORAGE, JSON.stringify(redeemedKeys));
    }

    function saveKeyQueue() {
        localStorage.setItem(KEY_QUEUE_STORAGE, JSON.stringify(keyQueue));
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function logWithTimestamp(message) {
        console.log(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    function findNextKey() {
        for (const key of keyQueue) {
            if (!(key in redeemedKeys) || redeemedKeys[key] === 'too many attempts') {
                return key;
            }
        }
        return null;
    }


    async function redeemNextKey() {
        if (redeemingInProgress) return;
        redeemingInProgress = true;

        const key = findNextKey();
        if (!key) {
            logWithTimestamp('No valid key found in queue.');
            redeemingInProgress = false;
            return;
        }

        logWithTimestamp(`Redeeming key: ${key}`);

        const keyInput = document.querySelector('#product_key');
        const ssaCheckbox = document.querySelector('#accept_ssa');
        const continueButton = document.querySelector('#register_btn');

        if (!keyInput || !ssaCheckbox || !continueButton) {
            logWithTimestamp('Missing redeem UI elements.');
            redeemingInProgress = false;
            return;
        }

        keyInput.value = key;
        ssaCheckbox.checked = true;
        continueButton.click();
        //logWithTimestamp(`Clicked redeem button for key: ${key}`);
        await sleep(2000);

        const bodyText = document.body.innerText;

        let status = 'success';
        if (bodyText.includes('too many recent activation attempts')) status = 'too many attempts';
        else if (bodyText.includes('already owns')) status = 'already owned';
        else if (bodyText.includes('not valid or is not a product code')) status = 'invalid';
        else if (bodyText.includes('requires ownership of another product')) status = 'dependent';
        else if (bodyText.includes('An unexpected error has occurred')) status = 'error';

        redeemedKeys[key] = status;
        saveRedeemedKeys();

        logWithTimestamp(`Key ${key} marked as: ${status}`);

        if (redeemedKeys.length % 50 === 0) createBackup();

        redeemingInProgress = false;
    }

    function createBackup() {
        const backupName = `steam_keys_redeemed_backup_${Date.now()}`;
        localStorage.setItem(backupName, JSON.stringify(redeemedKeys));
        logWithTimestamp(`Backup created: ${backupName}`);
    }

    function trimLast20() {
        redeemedKeys = redeemedKeys.slice(0, -20);
        saveRedeemedKeys();
        logWithTimestamp('Trimmed last 20 redeemed keys.');
    }

    function addRedeemButtonBelowSSA() {
        const ssaBox = document.querySelector('#accept_ssa');
        if (!ssaBox || document.getElementById('redeem-next-key')) return;

        const redeemButton = document.createElement('button');
        redeemButton.id = 'redeem-next-key';
        redeemButton.textContent = 'Redeem Next Key';
        redeemButton.style.marginTop = '10px';
        redeemButton.style.padding = '8px 12px';
        redeemButton.style.background = '#4caf50';
        redeemButton.style.color = 'white';
        redeemButton.style.border = 'none';
        redeemButton.style.borderRadius = '5px';
        redeemButton.style.cursor = 'pointer';
        redeemButton.style.fontSize = '14px';

        redeemButton.addEventListener('click', redeemNextKey);

        const parent = ssaBox.parentElement;
        if (parent) parent.appendChild(redeemButton);
    }

    // === Tampermonkey Menu Commands ===
    GM_registerMenuCommand('Redeem Next Key', redeemNextKey);
    GM_registerMenuCommand('Backup Redeemed Keys', createBackup);
    GM_registerMenuCommand('Trim Last 20 Redeemed Keys', trimLast20);

    window.addEventListener('load', () => {
        addRedeemButtonBelowSSA();
        logWithTimestamp('Steam Key Manual Redeemer loaded.');
    });
})();

