// ==UserScript==
// @name         Serializer Dracula Theme
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Apply the Dracula color palette to serializer.io
// @author       arma26
// @match        https://serializer.io/*
// @updateURL    https://raw.githubusercontent.com/arma26/tampermonkey-scripts/refs/heads/master/serializer-dracula-theme.js
// @downloadURL  https://raw.githubusercontent.com/arma26/tampermonkey-scripts/refs/heads/master/serializer-dracula-theme.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.textContent = `
        :root {
            color-scheme: dark;
            --dracula-fg: #f8f8f2;
            --dracula-bg-lighter: #424450;
            --dracula-bg-light: #343746;
            --dracula-bg: #282a36;
            --dracula-bg-dark: #21222c;
            --dracula-bg-darker: #191a21;
            --dracula-comment: #6272a4;
            --dracula-selection: #44475a;
            --dracula-subtle: #424450;
            --dracula-cyan: #8be9fd;
            --dracula-green: #50fa7b;
            --dracula-orange: #ffb86c;
            --dracula-pink: #ff79c6;
            --dracula-purple: #bd93f9;
            --dracula-red: #ff5555;
            --dracula-yellow: #f1fa8c;
        }

        html,
        body {
            background-color: var(--dracula-bg) !important;
            color: var(--dracula-fg) !important;
        }

        ::selection {
            background-color: var(--dracula-selection);
            color: var(--dracula-fg);
        }

        a {
            color: var(--dracula-cyan) !important;
        }

        a:visited {
            color: var(--dracula-purple) !important;
        }

        a:hover,
        a:focus-visible {
            color: var(--dracula-pink) !important;
        }

        a:focus-visible {
            outline: 2px solid var(--dracula-yellow) !important;
            outline-offset: 2px;
        }

        #item-table,
        #item-table thead,
        #item-table tbody,
        #item-table tfoot {
            background-color: var(--dracula-bg) !important;
        }

        #item-table tr {
            background-color: var(--dracula-bg) !important;
        }

        #item-table tr:hover {
            background-color: var(--dracula-bg-lighter) !important;
        }

        #item-table th,
        #item-table td {
            background-color: transparent !important;
            color: var(--dracula-fg) !important;
        }

        #item-table tr.read {
            background-color: var(--dracula-bg-dark) !important;
        }

        #item-table tr.read:hover {
            background-color: var(--dracula-selection) !important;
        }

        .item-title a {
            color: var(--dracula-cyan) !important;
            border-bottom-color: var(--dracula-cyan) !important;
        }

        .item-title a:visited,
        .read .item-title a:visited {
            color: var(--dracula-purple) !important;
            border-bottom-color: var(--dracula-purple) !important;
        }

        .item-title a:hover,
        .item-title a:visited:hover,
        .read .item-title a:visited:hover {
            color: var(--dracula-pink) !important;
            border-bottom-color: var(--dracula-pink) !important;
        }

        .domain,
        .short-domain,
        .muted,
        .muted span {
            color: var(--dracula-comment) !important;
        }

        span.muted a {
            color: var(--dracula-purple) !important;
        }

        .muted .fast {
            color: var(--dracula-green) !important;
        }

        .muted .medium {
            color: var(--dracula-orange) !important;
        }

        .muted .slow {
            color: var(--dracula-red) !important;
        }

        span.muted span.topped {
            color: var(--dracula-yellow) !important;
        }

        .menu {
            background-color: var(--dracula-bg-darker) !important;
            color: var(--dracula-fg) !important;
        }

        .menu #menu-container {
            background-color: var(--dracula-bg-dark) !important;
        }

        .menu .logo a,
        .menu .logo a:visited {
            color: var(--dracula-pink) !important;
        }

        .menu #settings-toggle {
            background-color: var(--dracula-bg-light) !important;
        }

        .menu #settings-toggle:hover {
            background-color: var(--dracula-selection) !important;
        }

        .menu #settings-toggle a,
        .menu #settings-toggle a:visited {
            color: var(--dracula-fg) !important;
        }

        #settings-panel {
            background-color: var(--dracula-bg-dark) !important;
            border-bottom-color: var(--dracula-subtle) !important;
            color: var(--dracula-fg) !important;
        }

        #settings-panel a:not(.session-button) {
            color: var(--dracula-cyan) !important;
        }

        #settings-panel .session-button {
            border-color: var(--dracula-bg-darker) !important;
            color: var(--dracula-bg-darker) !important;
        }

        #settings-panel .session-button.default {
            background-color: var(--dracula-purple) !important;
        }

        #settings-panel .session-button.default:hover {
            box-shadow: 0 0 5px var(--dracula-purple) !important;
        }

        #settings-panel .session-button.green {
            background-color: var(--dracula-green) !important;
        }

        #settings-panel .session-button.green:hover {
            box-shadow: 0 0 5px var(--dracula-green) !important;
        }

        #settings-panel .session-button.clear {
            background-color: var(--dracula-red) !important;
        }

        #settings-panel .session-button.clear:hover {
            box-shadow: 0 0 5px var(--dracula-red) !important;
        }

        .source-toggle.enabled img {
            border-color: var(--dracula-cyan) !important;
        }

        #item-table td.read-marker {
            background-color: var(--dracula-green) !important;
            color: var(--dracula-bg-darker) !important;
        }

        .flash {
            background-color: var(--dracula-purple) !important;
            border-bottom-color: var(--dracula-bg-darker) !important;
            color: var(--dracula-bg-darker) !important;
        }

        .flash a,
        .flash a:visited {
            background-color: var(--dracula-selection) !important;
            color: var(--dracula-fg) !important;
        }

        #log-button,
        #log-button:visited {
            background-color: var(--dracula-orange) !important;
            color: var(--dracula-bg-darker) !important;
        }

        #log-button:hover {
            background-color: var(--dracula-yellow) !important;
            color: var(--dracula-bg-darker) !important;
        }

        footer {
            color: var(--dracula-comment) !important;
        }
    `;

    document.documentElement.appendChild(style);
})();
