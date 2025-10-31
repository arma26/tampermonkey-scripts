// ==UserScript==
// @name         Steam Key Auto Redeemer
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Redeem Steam keys via UI JSON, auto-check SSA, click Continue, skip owned keys, detect activation success, and persist redeemed keys in localStorage
// @author       anonymous
// @match        *://store.steampowered.com/account/registerkey*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const REDEEMED_KEY = "steam_keys_redeemed";
    const USER_KEYS = "user_defined_keys";

    // Load collections
    let redeemed = JSON.parse(localStorage.getItem(REDEEMED_KEY)) || {};
    let userKeys = JSON.parse(localStorage.getItem(USER_KEYS)) || [];

    function saveRedeemed() {
        localStorage.setItem(REDEEMED_KEY, JSON.stringify(redeemed));
    }

    function saveUserKeys() {
        localStorage.setItem(USER_KEYS, JSON.stringify(userKeys));
    }

    // Floating UI container (bottom-right, grows upward)
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.bottom = '10px';
    container.style.right = '10px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column-reverse';
    container.style.gap = '10px';
    container.style.zIndex = 10000;
    document.body.appendChild(container);

    // Button creator
    function createButton(label, onClick) {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.padding = '8px 12px';
        btn.style.fontSize = '14px';
        btn.style.borderRadius = '6px';
        btn.style.background = '#5c7e10';
        btn.style.color = 'white';
        btn.style.border = 'none';
        btn.style.cursor = 'pointer';
        btn.onclick = onClick;
        container.appendChild(btn);
        return btn;
    }

    // Create Add Keys button
    createButton("Add Keys", () => {
        const existingBox = document.querySelector('#steam_key_input_box');
        const existingSubmit = document.querySelector('#steam_key_submit_btn');

        // If already visible, toggle off and clean up
        if (existingBox || existingSubmit) {
            if (existingBox) existingBox.remove();
            if (existingSubmit) existingSubmit.remove();
            return;
        }

        // Create input box dynamically
        const inputBox = document.createElement('textarea');
        inputBox.id = 'steam_key_input_box';
        inputBox.placeholder = 'Enter JSON array of keys';
        inputBox.style.width = '250px';
        inputBox.style.height = '100px';
        inputBox.style.fontSize = '12px';
        inputBox.style.borderRadius = '6px';
        inputBox.style.padding = '6px';
        inputBox.style.resize = 'none';
        inputBox.style.position = 'fixed';
        inputBox.style.bottom = '60px';
        inputBox.style.right = '10px';
        inputBox.style.zIndex = '10001';
        document.body.appendChild(inputBox);

        // Create Submit button
        const submitBtn = document.createElement('button');
        submitBtn.id = 'steam_key_submit_btn';
        submitBtn.textContent = 'Submit Keys';
        submitBtn.style.position = 'fixed';
        submitBtn.style.bottom = '170px';
        submitBtn.style.right = '10px';
        submitBtn.style.padding = '6px 10px';
        submitBtn.style.fontSize = '12px';
        submitBtn.style.borderRadius = '6px';
        submitBtn.style.background = '#3a5f0b';
        submitBtn.style.color = 'white';
        submitBtn.style.border = 'none';
        submitBtn.style.cursor = 'pointer';
        document.body.appendChild(submitBtn);

        submitBtn.onclick = () => {
            try {
                const newKeys = JSON.parse(inputBox.value);
                if (Array.isArray(newKeys)) {
                    let added = 0;
                    for (const key of newKeys) {
                        if (!userKeys.includes(key) && !redeemed[key]) {
                            userKeys.push(key);
                            added++;
                        }
                    }
                    saveUserKeys();
                    console.log(`[SteamRedeemer] Added ${added} new keys`);
                    alert(`Added ${added} new keys`);
                } else {
                    alert("Invalid JSON format — must be an array of strings.");
                }
            } catch (e) {
                alert("Invalid JSON: " + e.message);
            }

            // Clean up after submission
            inputBox.remove();
            submitBtn.remove();
        };
    });

    // Helper: find Continue button
    function findContinueButton() {
        const elements = Array.from(document.querySelectorAll('button, span'));
        return elements.find(el => el.innerText.trim() === "Continue");
    }

    // Get next untested key
    function getNextUntestedKey() {
        return userKeys.find(k => !(k in redeemed));
    }

    // Redeem logic
    async function redeemKey(key) {
        if (!key) {
            console.log("[SteamRedeemer] No untested keys available.");
            alert("No more untested keys available.");
            return;
        }

        const input = document.querySelector('#product_key');
        const checkbox = document.querySelector('#accept_ssa');
        const continueBtn = findContinueButton();

        if (!input || !checkbox || !continueBtn) {
            console.error("[SteamRedeemer] Required elements not found on the page.");
            return;
        }

        input.value = key;
        checkbox.checked = true;
        continueBtn.click();

        console.log(`[SteamRedeemer] Submitted key: ${key}`);

        // Wait for response
        await new Promise(r => setTimeout(r, 3000));

        const bodyText = document.body.innerText;

        // Detection cases
        if (/too many recent activation attempts/i.test(bodyText)) {
            console.warn(`[SteamRedeemer] Too many attempts — stopping.`);
            redeemed[key] = "too_many_attempts";
            saveRedeemed();
            alert("Too many activation attempts. Please try again later.");
            return;
        }

        if (/already owns the product/i.test(bodyText)) {
            console.log(`[SteamRedeemer] Already owned: ${key}`);
            redeemed[key] = "owned";
            saveRedeemed();
            const nextKey = getNextUntestedKey();
            if (nextKey) {
                input.value = nextKey;
                checkbox.checked = true;
                console.log(`[SteamRedeemer] Loaded next key: ${nextKey}`);
            }
            return;
        }

        const successH2 = document.querySelector('h2');
        if (successH2 && successH2.innerText.includes("Activation Successful!")) {
            console.log(`[SteamRedeemer] Activation successful: ${key}`);
            redeemed[key] = "owned";
            saveRedeemed();
            const nextKey = getNextUntestedKey();
            if (nextKey) {
                input.value = nextKey;
                checkbox.checked = true;
                console.log(`[SteamRedeemer] Loaded next key: ${nextKey}`);
            }
            return;
        }

        console.log(`[SteamRedeemer] No known result for key: ${key}`);
    }

    // Redeem Next Key button
    createButton("Redeem Next Key", async () => {
        const key = getNextUntestedKey();
        await redeemKey(key);
    });

})();
