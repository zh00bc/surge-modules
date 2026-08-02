(function () {
  "use strict";

  var INSTANCE_KEY = "__surgeDictionaryOverlayInstalled";
  var CONFIG_KEY = "__SURGE_DICTIONARY_CONFIG__";

  if (window[INSTANCE_KEY]) {
    return;
  }
  window[INSTANCE_KEY] = true;

  var defaults = {
    buttonLabel: "Lookup",
    maxSelectionLength: 120,
    providers: [
      {
        id: "cambridge",
        label: "Cambridge Dictionary",
        urlTemplate: "https://dictionary.cambridge.org/search/english-chinese-simplified/direct/?q={query}"
      }
    ]
  };
  var externalConfig = window[CONFIG_KEY] || {};
  var config = {
    buttonLabel: externalConfig.buttonLabel || defaults.buttonLabel,
    maxSelectionLength: Number(externalConfig.maxSelectionLength || defaults.maxSelectionLength),
    providers: normalizeProviders(externalConfig.providers || defaults.providers)
  };
  var state = {
    text: "",
    popupText: "",
    activeProviderId: config.providers[0].id,
    loadedProviders: {},
    timer: null,
    lastPoint: null,
    installed: false,
    popupOpen: false
  };

  function iconSvg(name) {
    var icons = {
      lookup: [
        "<svg class=\"surge-dict-icon surge-dict-lookup-icon\" viewBox=\"0 0 121.7 122.88\" aria-hidden=\"true\">",
        "<path class=\"surge-dict-find-handle\" d=\"M84.2 84.7 110.4 113.25\"/>",
        "<circle class=\"surge-dict-find-lens\" cx=\"53.62\" cy=\"53.62\" r=\"47.64\"/>",
        "<path class=\"surge-dict-find-highlight\" d=\"M29.13 45.74c-.99 2.1-3.49 3-5.59 2.01-2.1-.99-3-3.49-2.01-5.59 1.53-3.22 3.36-6.25 5.5-9.08 2.13-2.81 4.59-5.45 7.39-7.92 1.73-1.53 4.39-1.37 5.92.36 1.53 1.73 1.37 4.39-.36 5.92-2.33 2.06-4.41 4.3-6.23 6.7-1.81 2.39-3.35 4.92-4.62 7.6Z\"/>",
        "</svg>"
      ].join(""),
      close: [
        "<svg class=\"surge-dict-icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\">",
        "<path d=\"M7.75 7.75 16.25 16.25\"/>",
        "<path d=\"m16.25 7.75-8.5 8.5\"/>",
        "</svg>"
      ].join("")
    };

    return icons[name] || "";
  }

  function normalizeProviders(providers) {
    var normalized = [];
    (providers || []).forEach(function (provider) {
      if (!provider || !provider.id || !provider.label || !provider.urlTemplate) {
        return;
      }
      normalized.push({
        id: String(provider.id),
        label: String(provider.label),
        urlTemplate: String(provider.urlTemplate)
      });
    });
    return normalized.length ? normalized : defaults.providers;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function visualViewportBounds() {
    var viewport = window.visualViewport;
    var left = viewport ? viewport.offsetLeft || 0 : 0;
    var top = viewport ? viewport.offsetTop || 0 : 0;
    var width = viewport ? viewport.width || window.innerWidth : window.innerWidth;
    var height = viewport ? viewport.height || window.innerHeight : window.innerHeight;

    return {
      left: left,
      top: top,
      right: left + width,
      bottom: top + height,
      width: width,
      height: height
    };
  }

  function activeElementAllowsLookup() {
    var active = document.activeElement;
    if (!active) {
      return true;
    }

    var tag = String(active.tagName || "").toLowerCase();
    return tag !== "input" && tag !== "textarea" && !active.isContentEditable;
  }

  function normalizedSelectionText(selection) {
    if (!selection || selection.isCollapsed || !activeElementAllowsLookup()) {
      return "";
    }

    var text = String(selection.toString() || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > config.maxSelectionLength) {
      return "";
    }

    return text;
  }

  function selectionRect(selection) {
    if (!selection || !selection.rangeCount) {
      return null;
    }

    var range = selection.getRangeAt(0);
    var rect = range.getBoundingClientRect();
    if (rect && (rect.width || rect.height)) {
      return rect;
    }

    var rects = range.getClientRects();
    return rects && rects.length ? rects[0] : null;
  }

  function providerUrl(provider, text) {
    var encoded = encodeURIComponent(text);
    if (provider.urlTemplate.indexOf("{query}") !== -1) {
      return provider.urlTemplate.replace(/\{query\}/g, encoded);
    }
    return provider.urlTemplate + encoded;
  }

  function providerById(id) {
    for (var i = 0; i < config.providers.length; i += 1) {
      if (config.providers[i].id === id) {
        return config.providers[i];
      }
    }
    return config.providers[0];
  }

  function isTouchLayout() {
    return window.matchMedia && (
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches
    );
  }

  function hideButton() {
    if (!state.installed) {
      return;
    }

    state.text = "";
    lookupButton.style.display = "none";
  }

  function placeButton(rect) {
    lookupButton.style.display = "block";
    lookupButton.style.visibility = "hidden";

    var viewport = visualViewportBounds();
    var margin = 12;
    var width = lookupButton.offsetWidth || 46;
    var height = lookupButton.offsetHeight || 46;

    if (isTouchLayout()) {
      var touchMargin = 16;
      var touchBottomOffset = 92;
      var touchLeft = viewport.right - width - touchMargin;
      var touchTop = viewport.bottom - height - touchBottomOffset;

      lookupButton.style.left = Math.round(clamp(touchLeft, viewport.left + touchMargin, viewport.right - width - touchMargin)) + "px";
      lookupButton.style.top = Math.round(clamp(touchTop, viewport.top + touchMargin, viewport.bottom - height - touchMargin)) + "px";
      lookupButton.style.right = "auto";
      lookupButton.style.bottom = "auto";
      lookupButton.style.visibility = "visible";
      return;
    }

    var left = rect ? rect.right - (width / 2) : state.lastPoint.x - (width / 2);
    var top = rect ? rect.bottom + 9 : state.lastPoint.y + 9;

    if (top + height > viewport.bottom - margin && rect) {
      top = rect.top - height - 9;
    }

    lookupButton.style.left = Math.round(clamp(left, viewport.left + margin, viewport.right - width - margin)) + "px";
    lookupButton.style.top = Math.round(clamp(top, viewport.top + margin, viewport.bottom - height - margin)) + "px";
    lookupButton.style.right = "auto";
    lookupButton.style.bottom = "auto";
    lookupButton.style.visibility = "visible";
  }

  function refreshButton() {
    if (state.popupOpen) {
      hideButton();
      return;
    }

    var selection = window.getSelection ? window.getSelection() : null;
    var text = normalizedSelectionText(selection);
    if (!text) {
      hideButton();
      return;
    }

    var rect = selectionRect(selection);
    if (!rect && !state.lastPoint) {
      hideButton();
      return;
    }

    state.text = text;
    placeButton(rect);
  }

  function scheduleRefresh(delay) {
    clearTimeout(state.timer);
    state.timer = setTimeout(refreshButton, delay || 120);
  }

  function rememberPoint(event) {
    var touch = event.changedTouches && event.changedTouches[0];
    var point = touch || event;
    if (typeof point.clientX === "number" && typeof point.clientY === "number") {
      state.lastPoint = {
        x: point.clientX,
        y: point.clientY
      };
    }
  }

  function setFrameLoading(id, loading) {
    var frameWrap = frameByProvider[id];
    if (!frameWrap) {
      return;
    }
    frameWrap.className = loading ? "surge-dict-frame is-loading" : "surge-dict-frame";
  }

  function activateProvider(providerId) {
    var provider = providerById(providerId);
    state.activeProviderId = provider.id;

    config.providers.forEach(function (item) {
      var active = item.id === provider.id;
      tabByProvider[item.id].setAttribute("aria-selected", active ? "true" : "false");
      tabByProvider[item.id].className = active ? "is-active" : "";
      frameByProvider[item.id].style.display = active ? "block" : "none";
    });

    if (!state.loadedProviders[provider.id]) {
      setFrameLoading(provider.id, true);
      iframeByProvider[provider.id].src = providerUrl(provider, state.popupText);
      state.loadedProviders[provider.id] = true;
    }
  }

  function openPopup(event) {
    event.preventDefault();
    event.stopPropagation();

    var text = state.text;
    if (!text) {
      return;
    }

    state.popupOpen = true;
    state.popupText = text;
    state.loadedProviders = {};
    popup.style.display = "block";
    popup.setAttribute("aria-hidden", "false");
    hideButton();
    activateProvider(state.activeProviderId);
  }

  function closePopup(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    state.popupOpen = false;
    state.popupText = "";
    popup.style.display = "none";
    popup.setAttribute("aria-hidden", "true");
    Object.keys(iframeByProvider).forEach(function (id) {
      iframeByProvider[id].removeAttribute("src");
      frameByProvider[id].style.display = "none";
      setFrameLoading(id, false);
    });
  }

  function install() {
    if (state.installed || !document.body) {
      return;
    }

    (document.head || document.documentElement).appendChild(style);
    document.body.appendChild(lookupButton);
    document.body.appendChild(popup);
    state.installed = true;
  }

  var style = document.createElement("style");
  style.setAttribute("data-surge-dictionary-overlay", "1");
  style.textContent = [
    "#surge-dictionary-lookup{position:fixed;display:none;z-index:2147483647;width:46px;height:46px;padding:0;border:1px solid rgba(0,122,255,.16);border-radius:999px;background:rgba(255,255,255,.92);box-shadow:0 10px 26px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.88);color:#007aff;font:600 14px/1 system-ui,sans-serif;letter-spacing:0;text-align:center;-webkit-tap-highlight-color:transparent;touch-action:manipulation;backdrop-filter:saturate(180%) blur(18px);-webkit-backdrop-filter:saturate(180%) blur(18px);}",
    "#surge-dictionary-lookup:active{transform:scale(.96);background:rgba(0,122,255,.08);box-shadow:0 6px 18px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.9);}",
    ".surge-dict-icon{display:block;width:20px;height:20px;margin:auto;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;}",
    ".surge-dict-lookup-icon{width:24px;height:24px;stroke-width:1.9;}",
    ".surge-dict-lookup-icon .surge-dict-find-handle{fill:none;stroke:#007aff;stroke-width:23;stroke-linecap:round;stroke-linejoin:round;}",
    ".surge-dict-lookup-icon .surge-dict-find-lens{fill:#90caf8;stroke:#007aff;stroke-width:11.96;}",
    ".surge-dict-lookup-icon .surge-dict-find-highlight{fill:#fff;stroke:none;}",
    "#surge-dictionary-popup{--surge-dict-active-color:#111;position:fixed;display:none;z-index:2147483647;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));height:min(680px,76vh);background:#fff;color:#111;border:1px solid rgba(0,0,0,.12);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.32);overflow:hidden;font:14px/1.35 system-ui,sans-serif;letter-spacing:0;}",
    "#surge-dictionary-popup *{box-sizing:border-box;}",
    ".surge-dict-shell{display:flex;flex-direction:column;width:100%;height:100%;}",
    ".surge-dict-tabbar{display:grid;grid-template-columns:minmax(0,1fr) 42px;align-items:stretch;min-height:44px;background:#fff;border-bottom:1px solid rgba(0,0,0,.1);overflow:hidden;}",
    ".surge-dict-tabs{display:flex;gap:0;min-width:0;overflow-x:auto;padding:0;background:#fff;-webkit-overflow-scrolling:touch;scrollbar-width:none;}",
    ".surge-dict-tabs::-webkit-scrollbar{display:none;}",
    ".surge-dict-tabs button{appearance:none;position:relative;display:flex;align-items:center;flex:0 0 auto;min-width:max-content;height:44px;border:0;border-radius:0;background:transparent;color:#5b5b5b;padding:0 12px;font:700 12.5px/1 system-ui,sans-serif;text-decoration:none;white-space:nowrap;-webkit-tap-highlight-color:transparent;box-shadow:none;}",
    ".surge-dict-tabs button.is-active{background:rgba(0,0,0,.045);color:var(--surge-dict-active-color);}",
    ".surge-dict-tabs button:active{background:rgba(0,0,0,.04);}",
    ".surge-dict-accent{height:0;flex:0 0 auto;background:var(--surge-dict-active-color);}",
    ".surge-dict-close{appearance:none;position:relative;z-index:2;display:grid;place-items:center;align-self:center;justify-self:center;border:0;background:rgba(0,0,0,.05);color:#333;width:28px;height:28px;border-radius:999px;padding:0;-webkit-tap-highlight-color:transparent;box-shadow:none;}",
    ".surge-dict-close .surge-dict-icon{width:18px;height:18px;stroke-width:2.2;}",
    ".surge-dict-close:active{background:#fff;transform:scale(.96);}",
    ".surge-dict-tab-label{display:block;letter-spacing:0;}",
    ".surge-dict-body{position:relative;flex:1;min-height:0;background:#fff;}",
    ".surge-dict-frame{position:absolute;inset:0;display:none;background:#fff;}",
    ".surge-dict-frame.is-loading:before{content:'Loading...';position:absolute;left:50%;top:46%;transform:translate(-50%,-50%);color:#777;font:600 13px/1 system-ui,sans-serif;}",
    ".surge-dict-frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;}",
    "@media (min-width:760px){#surge-dictionary-popup{left:auto;right:18px;bottom:18px;width:min(560px,42vw);height:min(720px,78vh);}}"
  ].join("");

  var lookupButton = document.createElement("button");
  lookupButton.id = "surge-dictionary-lookup";
  lookupButton.type = "button";
  lookupButton.innerHTML = iconSvg("lookup");
  lookupButton.setAttribute("aria-label", config.buttonLabel);
  lookupButton.setAttribute("title", config.buttonLabel);
  lookupButton.setAttribute("data-surge-dictionary-overlay", "1");

  var popup = document.createElement("section");
  popup.id = "surge-dictionary-popup";
  popup.setAttribute("aria-hidden", "true");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", config.buttonLabel);
  popup.setAttribute("data-surge-dictionary-overlay", "1");
  popup.innerHTML = [
    "<div class=\"surge-dict-shell\">",
    "<div class=\"surge-dict-tabbar\"><div class=\"surge-dict-tabs\" role=\"tablist\"></div><button class=\"surge-dict-close\" type=\"button\" aria-label=\"Close\">" + iconSvg("close") + "</button></div>",
    "<div class=\"surge-dict-accent\" aria-hidden=\"true\"></div>",
    "<div class=\"surge-dict-body\"></div>",
    "</div>"
  ].join("");

  var closeButton = popup.querySelector(".surge-dict-close");
  var tabs = popup.querySelector(".surge-dict-tabs");
  var body = popup.querySelector(".surge-dict-body");
  var tabByProvider = {};
  var frameByProvider = {};
  var iframeByProvider = {};

  config.providers.forEach(function (provider) {
    var tab = document.createElement("button");
    tab.type = "button";
    tab.title = provider.label;
    tab.setAttribute("aria-label", provider.label);
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", provider.id === state.activeProviderId ? "true" : "false");
    var label = document.createElement("span");
    label.className = "surge-dict-tab-label";
    label.textContent = provider.label;
    tab.appendChild(label);
    tab.addEventListener("click", function (event) {
      event.preventDefault();
      activateProvider(provider.id);
    }, true);
    tabs.appendChild(tab);
    tabByProvider[provider.id] = tab;

    var frame = document.createElement("div");
    frame.className = "surge-dict-frame";
    frame.style.display = "none";
    var iframe = document.createElement("iframe");
    iframe.title = provider.label;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    iframe.setAttribute("sandbox", "allow-forms allow-same-origin allow-scripts");
    iframe.addEventListener("load", function () {
      setFrameLoading(provider.id, false);
    });
    frame.appendChild(iframe);
    body.appendChild(frame);
    frameByProvider[provider.id] = frame;
    iframeByProvider[provider.id] = iframe;
  });

  lookupButton.addEventListener("click", openPopup, true);
  closeButton.addEventListener("click", closePopup, true);

  popup.addEventListener("touchstart", function (event) {
    event.stopPropagation();
  }, true);
  popup.addEventListener("mousedown", function (event) {
    event.stopPropagation();
  }, true);

  document.addEventListener("selectionchange", function () {
    scheduleRefresh(150);
  }, true);
  document.addEventListener("mouseup", function (event) {
    rememberPoint(event);
    scheduleRefresh(80);
  }, true);
  document.addEventListener("touchend", function (event) {
    rememberPoint(event);
    scheduleRefresh(180);
  }, true);
  document.addEventListener("keyup", function (event) {
    if (event.key === "Escape" && state.popupOpen) {
      closePopup(event);
      return;
    }
    scheduleRefresh(80);
  }, true);
  window.addEventListener("scroll", function () {
    if (!state.popupOpen) {
      hideButton();
    }
  }, { passive: true });
  window.addEventListener("resize", function () {
    if (!state.popupOpen) {
      hideButton();
    }
  }, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", function () {
      if (!state.popupOpen) {
        scheduleRefresh(60);
      }
    }, { passive: true });
    window.visualViewport.addEventListener("scroll", function () {
      if (!state.popupOpen) {
        scheduleRefresh(60);
      }
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
}());
