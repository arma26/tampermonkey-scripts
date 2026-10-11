// ==UserScript==
// @name         ChatGPT Conversation JSON Exporter
// @namespace    homespace
// @version      0.2.0
// @description  Export the full saved ChatGPT conversation to JSON with menu actions.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(() => {
  "use strict";

  const FILENAME_PREFIX = "chatgpt-conversation";

  const notify = (message) => {
    window.alert(message);
  };

  const getConversationTitle = () => {
    const heading = document.querySelector("main h1");
    if (heading && heading.textContent) {
      return heading.textContent.trim();
    }

    if (document.title) {
      return document.title.replace(" - ChatGPT", "").trim();
    }

    return "Untitled Conversation";
  };

  const pageWindow = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const nativeFetch = pageWindow.fetch?.bind(pageWindow);
  const conversationPath = /\/(?:c|backend-api\/conversations?)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/messages)?\/?$/i;
  const getConversationId = () => new URL(window.location.href).pathname.match(conversationPath)?.[1];
  let historyRequest = null;

  // Reuse the page's actual account/project request context, in memory only.
  // Cookies alone do not authorize ChatGPT's conversation API.
  if (nativeFetch) {
    pageWindow.fetch = function (input, options) {
      try {
        const url = new URL(typeof input === "string" ? input : input.url || String(input), window.location.href);
        const id = url.pathname.match(conversationPath)?.[1];
        if (url.origin === new URL(window.location.href).origin && url.pathname.startsWith("/backend-api/") && id) {
          const headers = new Headers(options?.headers ?? input.headers);
          historyRequest = { id, headers };
        }
      } catch (_) {
        // Observation must never change the site's own request behavior.
      }
      return nativeFetch(input, options);
    };
  }

  const buildExport = async () => {
    const id = getConversationId();
    if (!id) throw new Error("Open a saved conversation before exporting its full history.");
    if (!nativeFetch || historyRequest?.id !== id || !historyRequest.headers.get("Authorization")) {
      throw new Error("Reload this conversation after installing the script, wait for it to load, then export again.");
    }
    const url = window.location.href;
    const headers = new Headers(historyRequest.headers);
    const checkIdentity = () => {
      if (getConversationId() !== id || historyRequest?.id !== id ||
          historyRequest.headers.get("Authorization") !== headers.get("Authorization") ||
          historyRequest.headers.get("ChatGPT-Account-Id") !== headers.get("ChatGPT-Account-Id")) {
        throw new Error("Conversation or account changed during export. Please try again.");
      }
    };
    const pages = [];
    const cursors = new Set();
    let cursor = null;
    let title;
    while (true) {
      if (pages.length >= 1000) throw new Error("Conversation exceeded the export page limit. No partial export was created.");
      checkIdentity();
      const endpoint = new URL(`/backend-api/conversations/${id}${cursor === null ? "" : "/messages"}`, url);
      endpoint.searchParams.set("num_turns", "10");
      endpoint.searchParams.set("include_has_versions", "true");
      if (cursor !== null) endpoint.searchParams.set("before", cursor);
      const response = await nativeFetch(endpoint.href, {
        method: "GET", headers, credentials: "include", mode: "same-origin", redirect: "error",
        signal: AbortSignal.timeout(30000)
      });
      checkIdentity();
      if (!response.ok) throw new Error(`Conversation history request failed (HTTP ${response.status}). No partial export was created.`);
      const page = await response.json();
      checkIdentity();
      if (!Array.isArray(page.messages) || typeof page.page_info?.has_previous_page !== "boolean") {
        throw new Error("Unexpected conversation history format. No partial export was created.");
      }
      if (!pages.length) title = page.title;
      pages.push(page.messages);
      if (!page.page_info.has_previous_page) break;
      const next = page.page_info.start_cursor;
      if (typeof next !== "string" || !next || cursors.has(next)) {
        throw new Error("Conversation pagination cursor did not advance. No partial export was created.");
      }
      cursors.add(next);
      cursor = next;
    }
    // Pages arrive newest first; overlaps retain the newest copy of a message.
    const byId = new Map();
    for (const message of pages.slice().reverse().flat()) {
      if (!message || typeof message.id !== "string" || !message.id) {
        throw new Error("Conversation history contains an invalid message. No partial export was created.");
      }
      byId.set(message.id, message);
    }
    const messages = Array.from(byId.values(), (message, index) => ({
      index,
      role: message.author?.role || "unknown",
      text: Array.isArray(message.content?.parts)
        ? message.content.parts.filter(part => typeof part === "string").join("\n")
        : message.content?.text || "",
      id: message.id,
      // Preserve structured attachments, tool results, channels, and metadata.
      raw: message
    }));
    return {
      title: title || getConversationTitle(),
      url,
      exportedAt: new Date().toISOString(),
      complete: true,
      pageCount: pages.length,
      messageCount: messages.length,
      messages
    };
  };

  const formatJson = (data) => JSON.stringify(data, null, 2);

  const getFilename = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${FILENAME_PREFIX}-${timestamp}.json`;
  };

  const copyToClipboard = async () => {
    const json = formatJson(await buildExport());
    GM_setClipboard(json);
    notify("Conversation JSON copied to clipboard.");
  };

  const downloadJson = async () => {
    const json = formatJson(await buildExport());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const name = getFilename();

    GM_download({
      url,
      name,
      saveAs: true,
      onload: () => {
        URL.revokeObjectURL(url);
      },
      onerror: () => {
        URL.revokeObjectURL(url);
        notify("Download failed. Check the console for details.");
      },
    });
  };

  const previewJson = async () => {
    // Open synchronously while the menu action still has user activation.
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) throw new Error("Popup blocked. Allow popups to preview JSON.");
    previewWindow.opener = null;
    try {
      const json = formatJson(await buildExport());
      const pre = previewWindow.document.createElement("pre");
      pre.textContent = json;
      pre.style.whiteSpace = "pre-wrap";
      previewWindow.document.body.appendChild(pre);
      previewWindow.document.title = "Conversation JSON";
    } catch (error) {
      previewWindow.close();
      throw error;
    }
  };

  const showStats = async () => {
    const data = await buildExport();
    notify(`Title: ${data.title}\nMessages: ${data.messageCount}`);
  };

  let exporting = false;
  const withErrorHandling = (fn) => async () => {
    if (exporting) return notify("An export is already in progress. Please wait.");
    exporting = true;
    try {
      await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      console.error("ChatGPT export error:", error);
      notify(message);
    } finally {
      exporting = false;
    }
  };

  GM_registerMenuCommand("Copy conversation JSON", withErrorHandling(copyToClipboard));
  GM_registerMenuCommand("Download conversation JSON", withErrorHandling(downloadJson));
  GM_registerMenuCommand("Preview conversation JSON", withErrorHandling(previewJson));
  GM_registerMenuCommand("Show conversation stats", withErrorHandling(showStats));
})();
