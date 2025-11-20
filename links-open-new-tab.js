// ==UserScript==
// @name         Force All Links To Open In New Tabs
// @version      1.0
// @description  Automatically makes all links open in new tabs instead of the same tab.
// @match        *://serializer.io/
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  function forceLinks() {
    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href') || '';

      // Skip same-page anchors (#something)
      if (href.startsWith('#')) continue;

      // Skip mailto:, javascript:, etc.
      if (href.startsWith('mailto:')) continue;
      if (href.startsWith('javascript:')) continue;

      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }

  // Run once on load
  forceLinks();

  // Also run on dynamically added content
  const observer = new MutationObserver(() => forceLinks());
  observer.observe(document.body, { childList: true, subtree: true });
})();

