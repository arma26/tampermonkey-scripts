// ==UserScript==
// @name         Steam Key Redeemer (Simulated Click Version)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Redeems Steam keys using real UI clicks and tracks statuses
// @match        https://store.steampowered.com/account/registerkey*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const REDEEMED_KEY_STORAGE = 'steam_keys_redeemed';
  const KEY_QUEUE_STORAGE = 'steam_keys_queue';

  let steam_keys_redeemed = JSON.parse(localStorage.getItem(REDEEMED_KEY_STORAGE) || '{}');
  let steam_keys_queue = JSON.parse(localStorage.getItem(KEY_QUEUE_STORAGE) || '[]');
  let isWorking = false;
  let maxWidth = 0; // Track maximum width for debug window

  function saveState() {
    localStorage.setItem(REDEEMED_KEY_STORAGE, JSON.stringify(steam_keys_redeemed));
    localStorage.setItem(KEY_QUEUE_STORAGE, JSON.stringify(steam_keys_queue));
  }

  function logStatus(key, status) {
    steam_keys_redeemed[key] = status;
    saveState();
    updateDebugBox(key, status);
  }

  function updateDebugBox(key, status) {
    let debugBox = document.getElementById('steam-debug-box');
    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.id = 'steam-debug-box';
      debugBox.style.position = 'fixed';
      debugBox.style.bottom = '10px';
      debugBox.style.right = '10px';
      debugBox.style.background = 'rgba(0, 0, 0, 0.85)';
      debugBox.style.color = '#e0e0e0';
      debugBox.style.padding = '8px';
      debugBox.style.borderRadius = '8px';
      debugBox.style.fontSize = '12px';
      debugBox.style.fontFamily = 'monospace';
      debugBox.style.whiteSpace = 'nowrap'; // prevents wrapping
      debugBox.style.overflowX = 'auto'; // allows horizontal scroll if too long
      debugBox.style.overflowY = 'auto';
      debugBox.style.maxHeight = '200px';
      debugBox.style.zIndex = '99999';
      debugBox.style.display = 'inline-block'; // allow width to auto adjust
      document.body.appendChild(debugBox);
    }

    const line = document.createElement('div');
    line.textContent = `${new Date().toLocaleTimeString()} → ${key} : ${status}`;
    debugBox.appendChild(line);

    // Adjust the width of the debug box only if the line exceeds the current max width
    const currentWidth = line.scrollWidth;
    if (currentWidth > maxWidth) {
      maxWidth = currentWidth;
      debugBox.style.width = `${maxWidth + 20}px`; // Add padding to the width
    }

    // Keep scroll at bottom
    debugBox.scrollTop = debugBox.scrollHeight;
  }

  function addRedeemButton() {
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
    redeemButton.disabled = false;

    redeemButton.addEventListener('click', async () => {
      if (isWorking || steam_keys_queue.length === 0) return;
      redeemButton.disabled = true;
      isWorking = true;
      const key = steam_keys_queue.shift();
      await redeemKey(key);
      isWorking = false;
      redeemButton.disabled = false;
    });

    ssaBox.parentElement.appendChild(redeemButton);
  }

  async function redeemKey(key) {
    console.log(`[Redeemer] Starting with key: ${key}`);

    const keyField = document.querySelector('#product_key');
    const ssaBox = document.querySelector('#accept_ssa');
    const continueButton = document.querySelector('a span, button span');

    if (!keyField || !continueButton) {
      console.warn('[Redeemer] Could not find input or continue button.');
      return;
    }

    keyField.value = key;
    keyField.dispatchEvent(new Event('input', { bubbles: true }));
    if (ssaBox && !ssaBox.checked) ssaBox.click();

    const clickButton = [...document.querySelectorAll('span')]
      .find(el => el.textContent.trim() === 'Continue');
    if (clickButton) clickButton.click();
    else console.warn('[Redeemer] Continue button not found.');

    // Wait for overlay or message
    await new Promise(r => setTimeout(r, 1000));

    let status = 'unknown';
    const bodyText = document.body.innerText;

    if (bodyText.includes('already been activated')) {
      status = 'already owned';
    } else if (bodyText.includes('too many recent activation attempts')) {
      status = 'too many attempts';
    } else if (bodyText.includes('not valid or is not a product code')) {
      status = 'invalid';
    } else if (bodyText.includes('requires ownership of another product before activation')) {
      status = 'dependent';
    } else {
      status = 'success';
    }

    logStatus(key, status);
    console.log(`[Redeemer] ${key} → ${status}`);

    // If too many attempts, retry later
    if (status === 'too many attempts') {
      steam_keys_queue.push(key);
      saveState();
    }
  }

  GM_registerMenuCommand('Add Keys (JSON Array)', () => {
    const input = prompt('Paste JSON array of keys (e.g. ["AAAAA-BBBBB-CCCCC"])');
    try {
      const keys = JSON.parse(input);
      if (Array.isArray(keys)) {
        let added = 0;
        keys.forEach(k => {
          if (!steam_keys_queue.includes(k) && !steam_keys_redeemed[k]) {
            steam_keys_queue.push(k);
            added++;
          }
        });
        saveState();
        alert(`Added ${added} new keys. Total in queue: ${steam_keys_queue.length}`);
      } else {
        alert('Input must be a JSON array.');
      }
    } catch {
      alert('Invalid JSON.');
    }
  });

  window.addEventListener('load', addRedeemButton);
})();
