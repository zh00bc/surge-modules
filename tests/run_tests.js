const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const {
  buildGuardedRequest,
  buildModule: buildBypassModule,
  DEFAULT_REMOTE_SCRIPT_BASE_URL: BYPASS_REMOTE_SCRIPT_BASE_URL,
  GUARDED_REQUEST_OUTPUT_PATH,
  GUARDED_REQUEST_SCRIPT_PATH,
  LOCAL_MODULE_OUTPUT_PATH: BYPASS_LOCAL_MODULE_OUTPUT_PATH,
  MODULE_OUTPUT_PATH: BYPASS_MODULE_OUTPUT_PATH
} = require("../scripts/build");
const {
  buildInjector: buildDictionaryInjector,
  buildModule: buildDictionaryModule,
  DEFAULT_REMOTE_SCRIPT_BASE_URL: DICTIONARY_REMOTE_SCRIPT_BASE_URL,
  INJECTOR_OUTPUT_PATH: DICTIONARY_INJECTOR_OUTPUT_PATH,
  INJECTOR_SCRIPT_PATH: DICTIONARY_INJECTOR_SCRIPT_PATH,
  LOCAL_MODULE_OUTPUT_PATH: DICTIONARY_LOCAL_MODULE_OUTPUT_PATH,
  MODULE_OUTPUT_PATH: DICTIONARY_MODULE_OUTPUT_PATH
} = require("../scripts/build_dictionary");
const siteConfig = require("../sites.config");
const ECONOMIST_LISKOV_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36 Liskov";
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

function readRepoFile(filename) {
  return fs.readFileSync(path.join(root, filename), "utf8");
}

function readGeneratedModule() {
  return readRepoFile(BYPASS_MODULE_OUTPUT_PATH);
}

function readGeneratedDictionaryModule() {
  return readRepoFile(DICTIONARY_MODULE_OUTPUT_PATH);
}

function readLocalGeneratedModule() {
  return readRepoFile(BYPASS_LOCAL_MODULE_OUTPUT_PATH);
}

function readLocalGeneratedDictionaryModule() {
  return readRepoFile(DICTIONARY_LOCAL_MODULE_OUTPUT_PATH);
}

function runSurgeScript(filename, context) {
  const code = readRepoFile(filename);
  let doneValue;
  const sandbox = Object.assign({}, context, {
    URL,
    $done(value) {
      doneValue = value;
    }
  });

  vm.runInNewContext(code, sandbox, { filename });
  return doneValue;
}

function assertPlainEmptyObject(value) {
  assert.strictEqual(JSON.stringify(value), "{}");
}

function assertBlocked(result, ruleName) {
  assert.strictEqual(result.response.status, 204);
  assert.strictEqual(result.response.headers["X-Surge-BPC-Rule"], ruleName);
}

function assertIncludes(text, expected) {
  assert.ok(text.includes(expected), `Expected to find: ${expected}`);
}

function assertNotIncludes(text, unexpected) {
  assert.ok(!text.includes(unexpected), `Did not expect to find: ${unexpected}`);
}

function testGeneratedFilesAreCurrent() {
  assert.strictEqual(readGeneratedModule(), buildBypassModule({
    remoteBaseUrl: BYPASS_REMOTE_SCRIPT_BASE_URL,
    scriptUpdateInterval: 86400
  }));
  assert.strictEqual(readLocalGeneratedModule(), buildBypassModule());
  assert.strictEqual(readRepoFile(GUARDED_REQUEST_OUTPUT_PATH), buildGuardedRequest());
  assert.strictEqual(readGeneratedDictionaryModule(), buildDictionaryModule({
    remoteBaseUrl: DICTIONARY_REMOTE_SCRIPT_BASE_URL,
    scriptUpdateInterval: 86400
  }));
  assert.strictEqual(readLocalGeneratedDictionaryModule(), buildDictionaryModule());
  assert.strictEqual(readRepoFile(DICTIONARY_INJECTOR_OUTPUT_PATH), buildDictionaryInjector());
}

function testModulePassesSurgeParser(moduleText, profileName) {
  const surgeCli = "/Applications/Surge.app/Contents/Applications/surge-cli";

  if (!fs.existsSync(surgeCli)) {
    return;
  }

  const profile = [
    moduleText,
    "",
    "[Rule]",
    "FINAL,DIRECT",
    ""
  ].join("\n");
  const profilePath = path.join(os.tmpdir(), profileName);

  fs.writeFileSync(profilePath, profile);
  childProcess.execFileSync(surgeCli, ["--check", profilePath], { stdio: "pipe" });
  fs.rmSync(profilePath, { force: true });
}

function testGeneratedModulePassesSurgeParser() {
  testModulePassesSurgeParser(readGeneratedModule(), "bypass-paywalls-generated-check.conf");
  testModulePassesSurgeParser(readLocalGeneratedModule(), "bypass-paywalls-local-generated-check.conf");
  testModulePassesSurgeParser(readGeneratedDictionaryModule(), "dictionary-overlay-generated-check.conf");
  testModulePassesSurgeParser(readLocalGeneratedDictionaryModule(), "dictionary-overlay-local-generated-check.conf");
}

function testBpcStyleDomainTemplatesAreUsed() {
  assert.ok(siteConfig.sites.every((site) => site.domain), "Every site should declare a base domain");
  assert.ok(siteConfig.sites.some((site) => {
    return (site.blockRules || []).some((rule) => rule.includes("{domain}"));
  }), "Expected at least one BPC-style block rule template");
  assert.ok(siteConfig.sites.some((site) => {
    return (site.mitmHosts || []).some((host) => host.includes("{domain}"));
  }), "Expected MITM hosts to use domain templates");
}

function testDomainTemplatesEscapeHostDots() {
  const moduleText = readGeneratedModule();

  assertIncludes(moduleText, "^https:\\/\\/(?:[^\\/]+\\.)?economist\\.com\\/zephr\\/feature _ reject");
  assertIncludes(moduleText, "^https:\\/\\/www\\.theatlantic\\.com\\/zephr\\/ _ reject");
  assertIncludes(moduleText, "^https:\\/\\/meter-svc\\.nytimes\\.com\\/meter\\.js(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/cooking\\.nytimes\\.com\\/api\\/.+\\/access(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/(?:[^\\/]+\\.)?washingtonpost\\.com\\/.+\\/tetro-client\\/ _ reject");
}

function testBloombergFortressIsBlockedWithBloombergReferer() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=bloomberg",
    $request: {
      url: "https://assets.bwbx.io/s3/fence/fortress-client/main.js",
      headers: {
        Accept: "*/*",
        Referer: "https://www.bloomberg.com/news/articles/example",
        "Sec-Fetch-Dest": "script"
      }
    }
  });

  assertBlocked(result, "bloomberg-fortress-client");
}

function testBloombergFortressWithoutBloombergRefererPassesThrough() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=bloomberg",
    $request: {
      url: "https://assets.bwbx.io/s3/fence/fortress-client/main.js",
      headers: {
        Accept: "*/*",
        Referer: "https://example.com/",
        "Sec-Fetch-Dest": "script"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testEconomistLiskovUserAgentIsSetForScriptRequests() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=economist",
    $request: {
      url: "https://www.economist.com/latest/app.js",
      headers: {
        Accept: "*/*",
        "Sec-Fetch-Dest": "script",
        "User-Agent": "Safari"
      }
    }
  });

  assert.strictEqual(result.headers["User-Agent"], ECONOMIST_LISKOV_UA);
}

function testEconomistFontRequestIsNotRewritten() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=economist",
    $request: {
      url: "https://www.economist.com/fonts/econ.woff2",
      headers: {
        Accept: "*/*",
        "Sec-Fetch-Dest": "font",
        "User-Agent": "Safari"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkerDocumentNavigationIsNotBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/cartoons",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Sec-Fetch-Dest": "document"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkerRootScriptIsBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/paywall-loader",
      headers: {
        Accept: "*/*",
        Referer: "https://www.newyorker.com/magazine/example",
        "Sec-Fetch-Dest": "script",
        "Sec-Fetch-Mode": "no-cors"
      }
    }
  });

  assertBlocked(result, "conde-nast-root-script");
}

function testNewYorkerRootRequestWithoutRefererIsNotBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/paywall-loader",
      headers: {
        Accept: "*/*",
        "Sec-Fetch-Dest": "script",
        "Sec-Fetch-Mode": "no-cors"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkerRootRequestWithEmptyDestinationIsNotBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/paywall-loader",
      headers: {
        Accept: "*/*",
        Referer: "https://www.newyorker.com/magazine/example",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkerRootRequestWithoutDestinationIsNotBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/paywall-loader",
      headers: {
        Accept: "*/*",
        Referer: "https://www.newyorker.com/magazine/example"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkerUserContextIsNotBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/user-context?referrer=https%3A%2F%2Fwww.newyorker.com%2Fmagazine%2Fexample&verso=true",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkerFontIsNotBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=newyorker",
    $request: {
      url: "https://www.newyorker.com/.design/fonts/TNY%20Adobe%20Caslon%20Pro/TNYAdobeCaslonPro-Regular.woff2",
      headers: {
        Accept: "*/*",
        Referer: "https://www.newyorker.com/magazine/example",
        "Sec-Fetch-Dest": "font"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testNewYorkTimesDocumentUserAgentIsSet() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=nytimes",
    $request: {
      url: "https://www.nytimes.com/2026/06/30/world/example.html",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Sec-Fetch-Dest": "document",
        "User-Agent": "Safari",
        Cookie: "NYT-S=keep; nyt-a=keep"
      }
    }
  });

  assert.strictEqual(result.headers["User-Agent"], "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)");
  assert.strictEqual(result.headers.Cookie, "NYT-S=keep; nyt-a=keep");
}

function testNewYorkTimesGamesAreExcluded() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=nytimes",
    $request: {
      url: "https://www.nytimes.com/games/wordle/index.html",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Sec-Fetch-Dest": "document",
        "User-Agent": "Safari"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testScmpTinypassIsBlockedWithScmpReferer() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=scmp",
    $request: {
      url: "https://cdn.tinypass.com/api/tinypass.min.js",
      headers: {
        Accept: "*/*",
        Referer: "https://www.scmp.com/news/hong-kong/example",
        "Sec-Fetch-Dest": "script"
      }
    }
  });

  assertBlocked(result, "scmp-tinypass");
}

function testScmpTinypassWithoutScmpRefererPassesThrough() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=scmp",
    $request: {
      url: "https://cdn.tinypass.com/api/tinypass.min.js",
      headers: {
        Accept: "*/*",
        Referer: "https://example.com/",
        "Sec-Fetch-Dest": "script"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testScmpAmpAccessIsBlocked() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=scmp",
    $request: {
      url: "https://cdn.ampproject.org/v0/amp-access-0.1.js",
      headers: {
        Accept: "*/*",
        Referer: "https://amp.scmp.com/news/hong-kong/example",
        "Sec-Fetch-Dest": "script"
      }
    }
  });

  assertBlocked(result, "scmp-amp-access");
}

function testScmpAmpAccessWithoutScmpRefererPassesThrough() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=scmp",
    $request: {
      url: "https://cdn.ampproject.org/v0/amp-access-0.1.js",
      headers: {
        Accept: "*/*",
        Referer: "https://example.com/",
        "Sec-Fetch-Dest": "script"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testWallStreetJournalRefererIsSetForDocumentRequests() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=wsj",
    $request: {
      url: "https://www.wsj.com/articles/example",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://example.com/",
        "Sec-Fetch-Dest": "document"
      }
    }
  });

  assert.strictEqual(result.headers.Referer, "https://www.drudgereport.com/");
}

function testWallStreetJournalImageRequestIsNotRewritten() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=wsj",
    $request: {
      url: "https://www.wsj.com/images/example.jpg",
      headers: {
        Accept: "image/avif,image/webp,*/*",
        Referer: "https://example.com/",
        "Sec-Fetch-Dest": "image"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testWashingtonPostGooglebotHeadersAreSetForDocumentRequests() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=washingtonpost",
    $request: {
      url: "https://www.washingtonpost.com/politics/example/",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Referer: "https://example.com/",
        "Sec-Fetch-Dest": "document",
        "User-Agent": "Safari"
      }
    }
  });

  assert.strictEqual(result.headers["User-Agent"], GOOGLEBOT_UA);
  assert.strictEqual(result.headers.Referer, "https://www.google.com/");
  assert.strictEqual(result.headers["X-Forwarded-For"], "66.249.66.1");
}

function testWashingtonPostFontRequestIsNotRewritten() {
  const result = runSurgeScript(GUARDED_REQUEST_OUTPUT_PATH, {
    $argument: "site=washingtonpost",
    $request: {
      url: "https://www.washingtonpost.com/fonts/postoni.woff2",
      headers: {
        Accept: "*/*",
        "Sec-Fetch-Dest": "font",
        "User-Agent": "Safari"
      }
    }
  });

  assertPlainEmptyObject(result);
}

function testModuleUsesDeclarativeSurgeSections() {
  const moduleText = readGeneratedModule();

  assertIncludes(moduleText, "#!requirement=CORE_VERSION>=20");
  assertIncludes(moduleText, "#!generated-from=sites.config.js via scripts/build.js");
  assertIncludes(moduleText, "[URL Rewrite]");
  assertIncludes(moduleText, "[Header Rewrite]");
  assertIncludes(moduleText, "[Body Rewrite]");
  assertIncludes(moduleText, "[Script]");
}

function testModuleMovesPureBlocksOutOfJavascript() {
  const moduleText = readGeneratedModule();

  assertIncludes(moduleText, "^https:\\/\\/(?:[^\\/]+\\.)?economist\\.com\\/zephr\\/feature _ reject");
  assertIncludes(moduleText, "^https:\\/\\/(?:[^\\/]+\\.)?economist\\.com\\/(?:latest\\/wall-ui|script)\\.js(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/www\\.theatlantic\\.com\\/zephr\\/ _ reject");
  assertIncludes(moduleText, "^https:\\/\\/meter-svc\\.nytimes\\.com\\/meter\\.js(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/(?:www\\.)?nytimes\\.com\\/svc\\/onsite-messaging\\/query(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/mwcm\\.nyt\\.com\\/.+\\.js(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/cooking\\.nytimes\\.com\\/api\\/.+\\/access(?:[?#]|$) _ reject");
  assertIncludes(moduleText, "^https:\\/\\/(?:[^\\/]+\\.)?washingtonpost\\.com\\/.+\\/tetro-client\\/ _ reject");
}

function testModuleUsesGuardedHeadersForContextualHints() {
  const moduleText = readGeneratedModule();

  assertNotIncludes(moduleText, "header-replace User-Agent");
  assertIncludes(moduleText, "NewYorkTimesGuardedRequest");
  assertIncludes(moduleText, "EconomistGuardedRequest");
  assertIncludes(moduleText, "WallStreetJournalGuardedRequest");
  assertIncludes(moduleText, "WashingtonPostGuardedRequest");
  assertNotIncludes(moduleText, "header-add Referer https://www.drudgereport.com/");
}

function testModuleUsesBodyRewriteForCosmetics() {
  const moduleText = readGeneratedModule();

  assertNotIncludes(moduleText, "surge-bpc-cosmetic:bloomberg");
  assertIncludes(moduleText, "surge-bpc-cosmetic:economist");
  assertIncludes(moduleText, "adComponent_advert__");
  assertIncludes(moduleText, "adComponent_adcontainer__");
  assertIncludes(moduleText, "right-hand-rail-ads");
  assertIncludes(moduleText, "surge-bpc-cosmetic:newyorker");
  assertNotIncludes(moduleText, "font-family");
  assertNotIncludes(moduleText, "-apple-system");
  assertNotIncludes(moduleText, "BlinkMacSystemFont");
  assertNotIncludes(moduleText, "label,a,span,strong,em,small");
  assertIncludes(moduleText, "div[class*=\"AdWrapper-\"]");
  assertIncludes(moduleText, "aside.paywall-bar");
  assertIncludes(moduleText, "surge-bpc-cosmetic:theatlantic");
  assertIncludes(moduleText, "aside#paywall");
  assertIncludes(moduleText, "surge-bpc-cosmetic:nytimes");
  assertIncludes(moduleText, "div#dock-container");
  assertIncludes(moduleText, "surge-bpc-cosmetic:scmp");
  assertIncludes(moduleText, "GenericArticle-PaywallContainer");
  assertIncludes(moduleText, "surge-bpc-cosmetic:wsj");
  assertIncludes(moduleText, "cx-article-cover-overlay");
  assertIncludes(moduleText, "surge-bpc-cosmetic:washingtonpost");
  assertIncludes(moduleText, "subscribe-promo");
  assertIncludes(moduleText, "filter:none!important");
}

function testOnlyGuardedJavascriptRemains() {
  const moduleText = readGeneratedModule();
  const localModuleText = readLocalGeneratedModule();

  assertNotIncludes(moduleText, "request_cleanup.js");
  assertNotIncludes(moduleText, "response_cleanup.js");
  assertIncludes(moduleText, "BloombergGuardedRequest");
  assertIncludes(moduleText, "EconomistGuardedRequest");
  assertIncludes(moduleText, "NewYorkerGuardedRequest");
  assertIncludes(moduleText, "NewYorkTimesGuardedRequest");
  assertIncludes(moduleText, "ScmpGuardedRequest");
  assertIncludes(moduleText, "WallStreetJournalGuardedRequest");
  assertIncludes(moduleText, "WashingtonPostGuardedRequest");
  assertIncludes(moduleText, `script-path=${BYPASS_REMOTE_SCRIPT_BASE_URL}/${GUARDED_REQUEST_SCRIPT_PATH}`);
  assertIncludes(moduleText, "script-update-interval=86400");
  assertIncludes(localModuleText, `script-path=${GUARDED_REQUEST_SCRIPT_PATH}`);
  assertNotIncludes(localModuleText, "script-update-interval=86400");
  assertNotIncludes(moduleText, "script-path=guarded_request.js");
}

function testDictionaryModuleIsSeparateAndSiteScoped() {
  const moduleText = readGeneratedDictionaryModule();
  const localModuleText = readLocalGeneratedDictionaryModule();

  assertIncludes(moduleText, "#!name=Dictionary Overlay");
  assertIncludes(moduleText, "#!generated-from=dictionary.config.js via scripts/build_dictionary.js");
  assertIncludes(moduleText, "[Header Rewrite]");
  assertIncludes(moduleText, "[Script]");
  assertIncludes(moduleText, "[MITM]");
  assertIncludes(moduleText, `script-path=${DICTIONARY_REMOTE_SCRIPT_BASE_URL}/${DICTIONARY_INJECTOR_SCRIPT_PATH}`);
  assertIncludes(moduleText, "script-update-interval=86400");
  assertIncludes(localModuleText, `script-path=${DICTIONARY_INJECTOR_SCRIPT_PATH}`);
  assertNotIncludes(localModuleText, "script-update-interval=86400");
  assertIncludes(moduleText, "NewYorkerDictionaryOverlay");
  assertIncludes(moduleText, "EconomistDictionaryOverlay");
  assertIncludes(moduleText, "header-del X-Frame-Options");
  assertIncludes(moduleText, "^https:\\/\\/dictionary\\.cambridge\\.org\\/ header-del Content-Security-Policy");
  assertIncludes(moduleText, "hostname = %APPEND% ");
  assertIncludes(moduleText, "www.newyorker.com");
  assertIncludes(moduleText, "economist.com");
  assertIncludes(moduleText, "dictionary.cambridge.org");
  assertIncludes(moduleText, "www.merriam-webster.com");
  assertIncludes(moduleText, "www.collinsdictionary.com");
  assertIncludes(moduleText, "www.vocabulary.com");
  assertNotIncludes(moduleText, "youdao");
  assertNotIncludes(moduleText, "tinypass.com");
  assertNotIncludes(moduleText, "bwbx.io");
  assertNotIncludes(moduleText, "BypassPaywalls");
}

function createFakeDictionaryDom() {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || "").toUpperCase();
      this.attributes = {};
      this.children = [];
      this.eventListeners = {};
      this.parentNode = null;
      this.style = {};
      this.className = "";
      this.id = "";
      this._textContent = "";
      this.offsetWidth = 46;
      this.offsetHeight = 46;
    }

    set textContent(value) {
      this._textContent = String(value || "");
    }

    get textContent() {
      return this._textContent + this.children.map((child) => child.textContent).join("");
    }

    set innerHTML(value) {
      this._innerHTML = String(value || "");
      if (this.id !== "surge-dictionary-popup" || !this._innerHTML.includes("surge-dict-tabs")) {
        return;
      }

      const shell = new FakeElement("div");
      shell.className = "surge-dict-shell";
      const tabbar = new FakeElement("div");
      tabbar.className = "surge-dict-tabbar";
      const tabs = new FakeElement("div");
      tabs.className = "surge-dict-tabs";
      const close = new FakeElement("button");
      close.className = "surge-dict-close";
      close.setAttribute("aria-label", "Close");
      const accent = new FakeElement("div");
      accent.className = "surge-dict-accent";
      const body = new FakeElement("div");
      body.className = "surge-dict-body";

      tabbar.appendChild(tabs);
      tabbar.appendChild(close);
      shell.appendChild(tabbar);
      shell.appendChild(accent);
      shell.appendChild(body);
      this.children = [];
      this.appendChild(shell);
    }

    get innerHTML() {
      return this._innerHTML || "";
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    setAttribute(name, value) {
      const normalizedName = String(name);
      const normalizedValue = String(value);
      this.attributes[normalizedName] = normalizedValue;
      if (normalizedName === "id") {
        this.id = normalizedValue;
      }
      if (normalizedName === "class") {
        this.className = normalizedValue;
      }
    }

    getAttribute(name) {
      return this.attributes[String(name)];
    }

    removeAttribute(name) {
      delete this.attributes[String(name)];
      if (name === "src") {
        delete this.src;
      }
    }

    addEventListener(type, listener) {
      this.eventListeners[type] = this.eventListeners[type] || [];
      this.eventListeners[type].push(listener);
    }

    dispatch(type) {
      const event = {
        preventDefault() {},
        stopPropagation() {}
      };
      (this.eventListeners[type] || []).forEach((listener) => listener(event));
    }

    matches(selector) {
      if (selector.startsWith(".")) {
        return this.className.split(/\s+/).includes(selector.slice(1));
      }
      if (selector.startsWith("#")) {
        return this.id === selector.slice(1);
      }
      return this.tagName.toLowerCase() === selector.toLowerCase();
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selector) {
      const results = [];
      const visit = (node) => {
        node.children.forEach((child) => {
          if (child.matches(selector)) {
            results.push(child);
          }
          visit(child);
        });
      };

      visit(this);
      return results;
    }
  }

  class FakeDocument {
    constructor() {
      this.readyState = "complete";
      this.eventListeners = {};
      this.head = new FakeElement("head");
      this.body = new FakeElement("body");
      this.documentElement = new FakeElement("html");
      this.activeElement = this.body;
    }

    createElement(tagName) {
      return new FakeElement(tagName);
    }

    addEventListener(type, listener) {
      this.eventListeners[type] = this.eventListeners[type] || [];
      this.eventListeners[type].push(listener);
    }

    dispatch(type) {
      (this.eventListeners[type] || []).forEach((listener) => listener({ key: "" }));
    }
  }

  const document = new FakeDocument();
  const selection = {
    isCollapsed: false,
    rangeCount: 1,
    toString() {
      return "endurance";
    },
    getRangeAt() {
      return {
        getBoundingClientRect() {
          return {
            bottom: 130,
            height: 20,
            left: 80,
            right: 170,
            top: 110,
            width: 90
          };
        },
        getClientRects() {
          return [];
        }
      };
    }
  };
  const window = {
    __SURGE_DICTIONARY_CONFIG__: {
      buttonLabel: "查词",
      maxSelectionLength: 120,
      providers: [
        {
          id: "cambridge",
          label: "Cambridge Dictionary",
          urlTemplate: "https://dictionary.example/cambridge/{query}"
        },
        {
          id: "merriam-webster",
          label: "Merriam-Webster",
          urlTemplate: "https://dictionary.example/merriam/{query}"
        }
      ]
    },
    addEventListener() {},
    getSelection() {
      return selection;
    },
    innerHeight: 800,
    innerWidth: 1200,
    matchMedia() {
      return { matches: false };
    }
  };

  return {
    document,
    window,
    clearTimeout() {},
    setTimeout(callback) {
      callback();
      return 1;
    }
  };
}

function testDictionaryOverlaySelectionFlowWithFakeDom() {
  const sandbox = createFakeDictionaryDom();

  vm.runInNewContext(readRepoFile("src/dictionary/selection_lookup.js"), sandbox, {
    filename: "src/dictionary/selection_lookup.js"
  });

  const lookupButton = sandbox.document.body.children.find((child) => child.id === "surge-dictionary-lookup");
  const popup = sandbox.document.body.children.find((child) => child.id === "surge-dictionary-popup");

  assert.ok(lookupButton, "lookup button should be installed");
  assert.ok(popup, "popup should be installed");

  sandbox.document.dispatch("selectionchange");
  assert.strictEqual(lookupButton.style.display, "block");
  assert.strictEqual(lookupButton.style.visibility, "visible");

  lookupButton.dispatch("click");
  assert.strictEqual(popup.style.display, "block");
  assert.strictEqual(popup.getAttribute("aria-hidden"), "false");

  const tabs = popup.querySelector(".surge-dict-tabs");
  const body = popup.querySelector(".surge-dict-body");
  assert.strictEqual(tabs.children.length, 2);
  assert.strictEqual(tabs.children[0].textContent, "Cambridge Dictionary");
  assert.strictEqual(tabs.children[0].className, "is-active");
  assert.strictEqual(body.children[0].style.display, "block");
  assert.strictEqual(body.children[0].children[0].src, "https://dictionary.example/cambridge/endurance");

  tabs.children[1].dispatch("click");
  assert.strictEqual(tabs.children[0].className, "");
  assert.strictEqual(tabs.children[1].className, "is-active");
  assert.strictEqual(body.children[0].style.display, "none");
  assert.strictEqual(body.children[1].style.display, "block");
  assert.strictEqual(body.children[1].children[0].src, "https://dictionary.example/merriam/endurance");
}

function testDictionaryInjectorAddsLookupOverlayToHtml() {
  const result = runSurgeScript(DICTIONARY_INJECTOR_OUTPUT_PATH, {
    $request: {
      url: "https://www.newyorker.com/magazine/example"
    },
    $response: {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Length": "44",
        "Content-Security-Policy": "default-src 'self'"
      },
      body: "<html><head></head><body><p>mountain</p></body></html>"
    }
  });

  assertIncludes(result.body, "surge-dictionary-overlay");
  assertIncludes(result.body, "surge-dictionary-lookup");
  assertIncludes(result.body, "surge-dictionary-popup");
  assertIncludes(result.body, "surge-dict-tabs");
  assertIncludes(result.body, "surge-dict-icon");
  assertIncludes(result.body, "surge-dict-tab-label");
  assertIncludes(result.body, "surge-dict-tabbar");
  assertIncludes(result.body, "surge-dict-accent");
  assertIncludes(result.body, "--surge-dict-active-color");
  assertIncludes(result.body, "surge-dict-lookup-icon");
  assertIncludes(result.body, "border-bottom:1px solid rgba(0,0,0,.1)");
  assertIncludes(result.body, "--surge-dict-active-color:#111");
  assertIncludes(result.body, "color:#007aff");
  assertIncludes(result.body, "border:1px solid rgba(0,122,255,.16)");
  assertIncludes(result.body, "M5.6 4.8h7.15");
  assertIncludes(result.body, "M8.05 4.8v13.05");
  assertIncludes(result.body, "cx=\\\"16.35\\\" cy=\\\"16.35\\\" r=\\\"3.05\\\"");
  assertIncludes(result.body, ".surge-dict-lookup-icon .surge-dict-book{fill:rgba(0,122,255,.08);stroke:currentColor;}");
  assertIncludes(result.body, "min-height:44px");
  assertIncludes(result.body, "height:44px");
  assertIncludes(result.body, "text-decoration:none");
  assertIncludes(result.body, ".surge-dict-tabs button.is-active{background:rgba(0,0,0,.045);color:var(--surge-dict-active-color);}");
  assertIncludes(result.body, ".surge-dict-accent{height:0;flex:0 0 auto;background:var(--surge-dict-active-color);}");
  assertIncludes(result.body, "function visualViewportBounds()");
  assertIncludes(result.body, "var viewport = visualViewportBounds();");
  assertIncludes(result.body, "window.visualViewport.addEventListener(\"resize\"");
  assertIncludes(result.body, "window.visualViewport.addEventListener(\"scroll\"");
  assertIncludes(result.body, "lookupButton.innerHTML = iconSvg(\"lookup\")");
  assertIncludes(result.body, "document.createElement(\"iframe\")");
  assertIncludes(result.body, "window.matchMedia(\"(pointer: coarse)\")");
  assertIncludes(result.body, "lookupButton.style.bottom = \"auto\"");
  assertIncludes(result.body, "https://dictionary.cambridge.org/search/english-chinese-simplified/direct/?q={query}");
  assertIncludes(result.body, "https://www.merriam-webster.com/dictionary/{query}");
  assertIncludes(result.body, "https://www.collinsdictionary.com/dictionary/english/{query}");
  assertIncludes(result.body, "\"label\":\"Cambridge Dictionary\"");
  assertIncludes(result.body, "\"label\":\"Merriam-Webster\"");
  assertIncludes(result.body, "\"label\":\"Collins Dictionary\"");
  assertIncludes(result.body, "\"label\":\"Vocabulary.com\"");
  assertIncludes(result.body, "https://www.vocabulary.com/dictionary/{query}");
  assertNotIncludes(result.body, "window.open");
  assertNotIncludes(result.body, "youdao");
  assertNotIncludes(result.body, "\"label\":\"M-W\"");
  assertNotIncludes(result.body, ".surge-dict-tabs button.is-active:after");
  assertNotIncludes(result.body, "accentColor");
  assertNotIncludes(result.body, "accentTextColor");
  assertNotIncludes(result.body, "iconUrl");
  assertNotIncludes(result.body, "surge-dict-logo");
  assertNotIncludes(result.body, "surge-dict-logo-wrap");
  assertNotIncludes(result.body, "createElement(\"img\")");
  assertNotIncludes(result.body, "apple-touch-icon");
  assertNotIncludes(result.body, "android-chrome-512x512");
  assertNotIncludes(result.body, "logo-sar2cf");
  assertNotIncludes(result.body, "var(--surge-dict-accent)");
  assertNotIncludes(result.body, "lookupButton.textContent = config.buttonLabel");
  assertNotIncludes(result.body, "lookupButton.addEventListener(\"touchstart\"");
  assertNotIncludes(result.body, "lookupButton.addEventListener(\"pointerdown\"");
  assertNotIncludes(result.body, "contextmenu");
  assertNotIncludes(result.body, "cx=\\\"10.75\\\" cy=\\\"10.75\\\"");
  assertNotIncludes(result.body, "M5.75 4.75h7.1");
  assertNotIncludes(result.body, "M6.25 4.75h7.2a2.2");
  assertNotIncludes(result.body, "M8.05 8.25h4.55");
  assertNotIncludes(result.body, "M7.2 2.45 8.72 6.2");
  assertNotIncludes(result.body, "M17.7 2.45 18.34 4.06");
  assertNotIncludes(result.body, "cx=\\\"13.95\\\" cy=\\\"13.95\\\" r=\\\"5.15\\\"");
  assertNotIncludes(result.body, "surge-dict-sparkle");
  assertNotIncludes(result.body, "M10.65 6.2c.38 2.2");
  assertNotIncludes(result.body, ".surge-dict-tabs button.is-active:before");
  assertNotIncludes(result.body, "border-bottom:4px solid var(--surge-dict-active-color)");
  assertNotIncludes(result.body, "surge-dict-title");
  assertNotIncludes(result.body, "popupTitle");
  assertNotIncludes(result.body, "aria-label=\\\"Close\\\">x</button>");
  assertIncludes(result.body, "</body>");
  assert.strictEqual(result.headers["Content-Type"], "text/html; charset=utf-8");
  assert.strictEqual(result.headers["Content-Length"], undefined);
  assert.strictEqual(result.headers["Content-Security-Policy"], undefined);
}

function testDictionaryInjectorSkipsNonHtmlResponses() {
  const result = runSurgeScript(DICTIONARY_INJECTOR_OUTPUT_PATH, {
    $request: {
      url: "https://www.newyorker.com/_next/app.css"
    },
    $response: {
      status: 200,
      headers: {
        "Content-Type": "text/css"
      },
      body: "body{color:#111}"
    }
  });

  assertPlainEmptyObject(result);
}

function testDictionaryInjectorIsIdempotent() {
  const result = runSurgeScript(DICTIONARY_INJECTOR_OUTPUT_PATH, {
    $request: {
      url: "https://www.economist.com/example"
    },
    $response: {
      status: 200,
      headers: {
        "Content-Type": "text/html"
      },
      body: "<html><body><!--surge-dictionary-overlay--></body></html>"
    }
  });

  assertPlainEmptyObject(result);
}

testGeneratedFilesAreCurrent();
testGeneratedModulePassesSurgeParser();
testBpcStyleDomainTemplatesAreUsed();
testDomainTemplatesEscapeHostDots();
testBloombergFortressIsBlockedWithBloombergReferer();
testBloombergFortressWithoutBloombergRefererPassesThrough();
testEconomistLiskovUserAgentIsSetForScriptRequests();
testEconomistFontRequestIsNotRewritten();
testNewYorkerDocumentNavigationIsNotBlocked();
testNewYorkerRootScriptIsBlocked();
testNewYorkerRootRequestWithoutRefererIsNotBlocked();
testNewYorkerRootRequestWithEmptyDestinationIsNotBlocked();
testNewYorkerRootRequestWithoutDestinationIsNotBlocked();
testNewYorkerUserContextIsNotBlocked();
testNewYorkerFontIsNotBlocked();
testNewYorkTimesDocumentUserAgentIsSet();
testNewYorkTimesGamesAreExcluded();
testScmpTinypassIsBlockedWithScmpReferer();
testScmpTinypassWithoutScmpRefererPassesThrough();
testScmpAmpAccessIsBlocked();
testScmpAmpAccessWithoutScmpRefererPassesThrough();
testWallStreetJournalRefererIsSetForDocumentRequests();
testWallStreetJournalImageRequestIsNotRewritten();
testWashingtonPostGooglebotHeadersAreSetForDocumentRequests();
testWashingtonPostFontRequestIsNotRewritten();
testModuleUsesDeclarativeSurgeSections();
testModuleMovesPureBlocksOutOfJavascript();
testModuleUsesGuardedHeadersForContextualHints();
testModuleUsesBodyRewriteForCosmetics();
testOnlyGuardedJavascriptRemains();
testDictionaryModuleIsSeparateAndSiteScoped();
testDictionaryOverlaySelectionFlowWithFakeDom();
testDictionaryInjectorAddsLookupOverlayToHtml();
testDictionaryInjectorSkipsNonHtmlResponses();
testDictionaryInjectorIsIdempotent();

console.log("All tests passed");
