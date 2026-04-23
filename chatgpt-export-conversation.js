// ==UserScript==
// @name         ChatGPT Conversation JSON Exporter
// @namespace    homespace
// @version      0.1.0
// @description  Export the active ChatGPT conversation to JSON with menu actions.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
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

  const getMessageText = (messageNode) => {
    const contentNode = messageNode.querySelector("[data-message-content]") || messageNode;
    return contentNode.innerText.trim();
  };

  const getMessages = () => {
    const nodes = Array.from(document.querySelectorAll("div[data-message-author-role]"));
    if (!nodes.length) {
      throw new Error("No ChatGPT messages found on this page.");
    }

    return nodes.map((node, index) => {
      const role = node.getAttribute("data-message-author-role") || "unknown";
      const text = getMessageText(node);

      return {
        index,
        role,
        text,
      };
    });
  };

  const buildExport = () => {
    const messages = getMessages();

    return {
      title: getConversationTitle(),
      url: window.location.href,
      exportedAt: new Date().toISOString(),
      messageCount: messages.length,
      messages,
    };
  };

  const formatJson = (data) => JSON.stringify(data, null, 2);

  const getFilename = () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `${FILENAME_PREFIX}-${timestamp}.json`;
  };

  const copyToClipboard = () => {
    const json = formatJson(buildExport());
    GM_setClipboard(json);
    notify("Conversation JSON copied to clipboard.");
  };

  const downloadJson = () => {
    const json = formatJson(buildExport());
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

  const previewJson = () => {
    const json = formatJson(buildExport());
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const previewWindow = window.open(url, "_blank", "noopener,noreferrer");

    if (!previewWindow) {
      URL.revokeObjectURL(url);
      throw new Error("Popup blocked. Allow popups to preview JSON.");
    }

    previewWindow.addEventListener("beforeunload", () => {
      URL.revokeObjectURL(url);
    });
  };

  const showStats = () => {
    const data = buildExport();
    notify(`Title: ${data.title}\nMessages: ${data.messageCount}`);
  };

  const withErrorHandling = (fn) => () => {
    try {
      fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      console.error("ChatGPT export error:", error);
      notify(message);
    }
  };

  GM_registerMenuCommand("Copy conversation JSON", withErrorHandling(copyToClipboard));
  GM_registerMenuCommand("Download conversation JSON", withErrorHandling(downloadJson));
  GM_registerMenuCommand("Preview conversation JSON", withErrorHandling(previewJson));
  GM_registerMenuCommand("Show conversation stats", withErrorHandling(showStats));
})();
