// ==UserScript==
// @name         Steam Key Auto Redeemer with Manual Key Filling
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Redeem keys from JSON input, check SSA, click Continue, skip redeemed and owned keys, store redeemed keys in localStorage, with manual key processing
// @author       Austin
// @match        *://store.steampowered.com/account/registerkey*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Local storage keys
    const storageKey = "steam_keys_redeemed";
    const keysStorageKey = "user_defined_keys"; // To store user-submitted keys

    // Load redeemed keys from localStorage
    let redeemed = JSON.parse(localStorage.getItem(storageKey)) || {};

    // Load keys from localStorage or fall back to an empty array
    let keys = JSON.parse(localStorage.getItem(keysStorageKey)) || [];

    // Index to track the current key in the list
    let currentKeyIndex = 0;

    // Get the next key that is not already redeemed or marked as owned, unless it's marked "too_many_attempts"
    function getNextUnredeemedKey() {
        while (currentKeyIndex < keys.length) {
            const key = keys[currentKeyIndex];
            // Check if the key is neither owned nor redeemed, or if it's "too_many_attempts"
            if (!redeemed[key] || redeemed[key] === "too_many_attempts") {
                return key; // Return the first valid key
            }
            currentKeyIndex++; // Skip owned or redeemed keys
        }
        return null; // No more unredeemed keys
    }

    // Save redeemed keys to localStorage
    function saveRedeemed() {
        localStorage.setItem(storageKey, JSON.stringify(redeemed));
    }

    // Save user-defined keys to localStorage by appending new keys that don't already exist
    function appendKeys(newKeysArray) {
        // Filter out keys that already exist in the user-defined keys list
        newKeysArray.forEach(key => {
            if (!keys.includes(key) && !redeemed[key]) { // Only add if not already in keys and not redeemed
                keys.push(key); // Add the new key to the list
            }
        });
        localStorage.setItem(keysStorageKey, JSON.stringify(keys));
    }

    // Function to find the Continue button
    function findContinueButton() {
        const buttons = Array.from(document.querySelectorAll('button, span'));
        return buttons.find(b => b.innerText.trim() === "Continue");
    }

    // Function to update the input field with the current key
    function updateInputField(key) {
        const input = document.querySelector('#product_key');
        if (input) {
            input.value = key;
        }
    }

    // Function to submit the current key
    async function redeemKey(key) {
        if (!key) {
            console.log("No more keys to redeem.");
            alert("All keys have been processed.");
            return;
        }

        console.log("Redeeming key:", key);

        // Select the input field and checkbox
        const input = document.querySelector('#product_key');
        const checkbox = document.querySelector('#accept_ssa');
        const continueButton = findContinueButton();

        if (!input || !checkbox || !continueButton) {
            console.error("Required elements not found on the page.");
            return;
        }

        // Set key and check the agreement checkbox
        input.value = key;
        checkbox.checked = true;

        // Click the Continue button
        continueButton.click();

        // Wait for Steam to respond
        await new Promise(r => setTimeout(r, 3000));

        const responseText = document.body.innerText;

        if (/already owns the product/i.test(responseText)) {
            console.log("Key already owned:", key);
            redeemed[key] = "owned";
            saveRedeemed();
        } else if (/successfully activated/i.test(responseText) || /product added/i.test(responseText)) {
            console.log("Key redeemed successfully:", key);
            redeemed[key] = "redeemed";
            saveRedeemed();
        } else if (/There have been too many recent activation attempts/i.test(responseText)) {
            console.log("Too many recent activation attempts detected for key:", key);
            redeemed[key] = "too_many_attempts";
            saveRedeemed();
        } else {
            console.log("Unknown response for key:", key);
        }
    }

    // Create the UI for inputting the JSON array of keys
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'fixed';
    uiContainer.style.bottom = '10px';
    uiContainer.style.right = '10px';
    uiContainer.style.zIndex = '1000';
    uiContainer.style.backgroundColor = '#fff';
    uiContainer.style.padding = '10px';
    uiContainer.style.borderRadius = '5px';
    uiContainer.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    uiContainer.style.display = 'flex';
    uiContainer.style.flexDirection = 'column';
    uiContainer.style.alignItems = 'flex-start';
    document.body.appendChild(uiContainer);

    // Input box for JSON keys
    const jsonInput = document.createElement('textarea');
    jsonInput.placeholder = 'Enter a JSON array of keys';
    jsonInput.style.width = '300px';
    jsonInput.style.height = '100px';
    jsonInput.style.marginBottom = '10px';
    jsonInput.style.padding = '5px';
    jsonInput.style.fontFamily = 'monospace';
    jsonInput.style.fontSize = '14px';
    uiContainer.appendChild(jsonInput);

    // Button to submit JSON array of keys
    const submitJsonBtn = document.createElement('button');
    submitJsonBtn.textContent = 'Save Keys';
    submitJsonBtn.onclick = () => {
        try {
            const parsedKeys = JSON.parse(jsonInput.value);
            if (Array.isArray(parsedKeys)) {
                appendKeys(parsedKeys); // Append new keys to existing keys, skipping duplicates
                alert("Keys added successfully!");
            } else {
                alert("Please enter a valid JSON array.");
            }
        } catch (e) {
            alert("Invalid JSON. Please check your input.");
        }
    };
    uiContainer.appendChild(submitJsonBtn);

    // Create a floating button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.position = 'fixed';
    buttonContainer.style.bottom = '10px';
    buttonContainer.style.right = '10px';
    buttonContainer.style.zIndex = '1000';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.flexDirection = 'column-reverse';  // Stack buttons upwards
    document.body.appendChild(buttonContainer);

    // Button to redeem the next unredeemed key
    const redeemBtn = document.createElement('button');
    redeemBtn.textContent = "Redeem Next Key";
    redeemBtn.style.marginBottom = '5px';
    redeemBtn.onclick = async () => {
        const key = getNextUnredeemedKey();
        if (!key) {
            alert("No more unredeemed keys.");
            return;
        }
        updateInputField(key); // Update the input field with the next key
        await redeemKey(key); // Redeem the key
        currentKeyIndex++; // Move to the next key in the list
    };
    buttonContainer.appendChild(redeemBtn);

})();
