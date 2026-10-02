// ==UserScript==
// @name         Hacker News Dracula Theme
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Apply the Dracula palette to Hacker News stories and comments
// @author       arma26
// @match        https://news.ycombinator.com/*
// @updateURL    https://raw.githubusercontent.com/arma26/tampermonkey-scripts/refs/heads/master/hacker-news-dracula-theme.js
// @downloadURL  https://raw.githubusercontent.com/arma26/tampermonkey-scripts/refs/heads/master/hacker-news-dracula-theme.js
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.textContent = `
        :root {
            color-scheme: dark;
            --dracula-fg: #F8F8F2;
            --dracula-bg-lighter: #424450;
            --dracula-bg-light: #343746;
            --dracula-bg: #282A36;
            --dracula-bg-dark: #21222C;
            --dracula-bg-darker: #191A21;
            --dracula-selection: #44475A;
            --dracula-cyan: #8BE9FD;
            --dracula-orange: #FFB86C;
            --dracula-pink: #FF79C6;
            --dracula-purple: #BD93F9;
            --dracula-yellow: #F1FA8C;
        }

        html, body {
            background: var(--dracula-bg-darker) !important;
            color: var(--dracula-fg) !important;
        }

        ::selection {
            background: var(--dracula-selection);
            color: var(--dracula-fg);
        }

        #hnmain {
            background: var(--dracula-bg) !important;
            color: var(--dracula-fg) !important;
        }

        #hnmain [bgcolor] {
            background-color: var(--dracula-bg-light) !important;
        }

        #hnmain > tbody > tr:first-child > td {
            background: var(--dracula-bg-dark) !important;
            border-bottom: 2px solid var(--dracula-orange);
        }

        #hnmain td[bgcolor="#ff6600"] {
            background: var(--dracula-orange) !important;
        }

        #hnmain td,
        #hnmain .default,
        #hnmain .title,
        #hnmain .comment,
        #hnmain .commtext,
        #hnmain .toptext {
            color: var(--dracula-fg) !important;
        }

        #hnmain a:link {
            color: var(--dracula-cyan) !important;
        }

        #hnmain a:visited {
            color: var(--dracula-purple) !important;
        }

        #hnmain .pagetop,
        #hnmain .pagetop a:link,
        #hnmain .pagetop a:visited {
            color: var(--dracula-fg) !important;
        }

        #hnmain .pagetop .topsel a,
        #hnmain .hnname a:link,
        #hnmain .hnname a:visited {
            color: var(--dracula-orange) !important;
        }

        #hnmain .titleline > a:link {
            color: var(--dracula-fg) !important;
        }

        #hnmain .titleline > a:visited {
            color: var(--dracula-purple) !important;
        }

        #hnmain .rank,
        #hnmain .sitebit,
        #hnmain .subtext,
        #hnmain .comhead,
        #hnmain .yclinks,
        #hnmain .reply,
        #hnmain font[color] {
            color: var(--dracula-purple) !important;
        }

        #hnmain .commtext:not(.c00) {
            color: var(--dracula-purple) !important;
        }

        #hnmain .votearrow {
            background: none !important;
            width: 0;
            height: 0;
            border: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-bottom: 9px solid var(--dracula-orange);
        }

        #hnmain textarea,
        #hnmain input:not([type="hidden"]),
        #hnmain select {
            background: var(--dracula-bg-light) !important;
            border: 1px solid var(--dracula-bg-lighter) !important;
            color: var(--dracula-fg) !important;
        }

        #hnmain input[type="submit"] {
            background: var(--dracula-purple) !important;
            color: var(--dracula-bg-darker) !important;
            cursor: pointer;
        }

        #hnmain pre,
        #hnmain code {
            background: var(--dracula-bg-dark) !important;
            color: var(--dracula-fg) !important;
        }

        #hnmain a:hover,
        #hnmain a:focus-visible {
            color: var(--dracula-pink) !important;
        }

        #hnmain a:focus-visible,
        #hnmain input:focus-visible,
        #hnmain textarea:focus-visible {
            outline: 2px solid var(--dracula-yellow) !important;
            outline-offset: 2px;
        }
    `;
    document.documentElement.appendChild(style);
})();
