// ==UserScript==
// @name         NeetCode reset progress
// @namespace    https://tampermonkey.net/
// @version      1.0
// @description  Delete localStorage to reset the state of each problem
// @match        https://neetcode.io/*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function() {
    'use strict';

    const regex = /.*?_python$/;

    function getMatchingKeys() {
        const matches = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (regex.test(key)) {
                matches.push(key);
            }
        }
        return matches;
    }

    function cleanKeys() {
        const matches = getMatchingKeys();

        if (matches.length === 0) {
            alert("No matching localStorage collections found.");
            return;
        }

        const message =
            "The following localStorage keys match '.*?_python$':\n\n" +
            matches.join("\n") +
            "\n\nDo you want to DELETE them?";

        const ok = confirm(message);

        if (!ok) {
            alert("Aborted. No keys were deleted.");
            return;
        }

        matches.forEach(k => localStorage.removeItem(k));

        alert("Deleted keys:\n\n" + matches.join("\n"));
    }

    GM_registerMenuCommand("Clean Python Collections", cleanKeys);
})();
