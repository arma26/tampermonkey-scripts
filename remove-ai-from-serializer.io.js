// ==UserScript==
// @name         Remove AI links from serializer.io
// @namespace    http://tampermonkey.net/
// @version      0.4.1
// @description  Remove AI links from serializer.io
// @author       arma26
// @match        https://serializer.io/*
// @updateURL    https://gist.githubusercontent.com/arma26/1ad0782b7eddb210165811d7e1a67cc1/raw/
// @downloadURL  https://gist.githubusercontent.com/arma26/1ad0782b7eddb210165811d7e1a67cc1/raw/
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    let removedCount = 0;

    function removeAIEntries() {
        const titles = document.querySelectorAll("tr h2.item-title a");

        titles.forEach(title => {
            // Check for case-sensitive keywords
            const caseSensitiveMatch = title.innerText.includes("AI");

            // Check for case-insensitive keywords
            const caseInsensitiveMatch = ["LLM", "agent", "GPT", "Claude", "Gemini", "copilot"]
                .some(keyword => title.innerText.toLowerCase().includes(keyword.toLowerCase()));

            if (caseSensitiveMatch || caseInsensitiveMatch) {
                const storyRow = title.closest("tr");
                if (storyRow) {
                    console.log("Removed:", title.innerText.trim());
                    storyRow.remove();
                    removedCount++;
                    console.log("Total removed so far:", removedCount);
                }
            }
        });
    }

    removeAIEntries();

    let debounceTimeout;
    const observer = new MutationObserver(() => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(removeAIEntries, 200);
    });

    observer.observe(document.body, { childList: true, subtree: true });

})();
