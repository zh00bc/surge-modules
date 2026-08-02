const fs = require("fs");
const path = require("path");
const config = require("../dictionary.config");
const {
  escapeRegex,
  htmlPattern,
  section,
  unique
} = require("./surge_utils");

const root = path.resolve(__dirname, "..");
const DIST_DIR = "dist";
const MODULE_FILENAME = "DictionaryOverlay.sgmodule";
const MODULE_BUNDLE_DIR = "DictionaryOverlay";
const INJECTOR_FILENAME = "inject_response.js";
const INJECTOR_SCRIPT_PATH = `${MODULE_BUNDLE_DIR}/${INJECTOR_FILENAME}`;
const MODULE_OUTPUT_PATH = path.join(DIST_DIR, MODULE_FILENAME);
const LOCAL_MODULE_OUTPUT_PATH = path.join(DIST_DIR, "local", MODULE_FILENAME);
const INJECTOR_OUTPUT_PATH = path.join(DIST_DIR, INJECTOR_SCRIPT_PATH);
const SELECTION_LOOKUP_SOURCE_PATH = path.join("src", "dictionary", "selection_lookup.js");
const DEFAULT_REMOTE_SCRIPT_BASE_URL = process.env.SURGE_MODULES_RAW_BASE ||
  "https://raw.githubusercontent.com/zh00bc/surge-modules/main/dist";

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function scriptPath(scriptPath, options) {
  if (!options || !options.remoteBaseUrl) {
    return scriptPath;
  }

  return `${normalizeBaseUrl(options.remoteBaseUrl)}/${scriptPath}`;
}

function scriptName(site) {
  const words = String(site.label || site.id)
    .replace(/^The\s+/i, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const readableName = words.map((word) => {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join("");

  return `${readableName || site.id}DictionaryOverlay`;
}

function siteHtmlPattern(site) {
  return htmlPattern(site, config.defaults.htmlAssetExclusion);
}

function htmlMitmHosts(site) {
  return (site.htmlHosts || ["www"]).map((host) => {
    return host ? `${host}.${site.domain}` : site.domain;
  });
}

function frameHosts() {
  return unique((config.lookup.providers || []).flatMap((provider) => provider.frameHosts || []));
}

function frameHostPattern(host) {
  return escapeRegex(host).replace(/^\\\*\\\./, "(?:[^\\/]+\\.)?");
}

function pageConfig() {
  return {
    buttonLabel: config.lookup.buttonLabel,
    maxSelectionLength: config.lookup.maxSelectionLength,
    providers: (config.lookup.providers || []).map((provider) => ({
      id: provider.id,
      label: provider.label,
      urlTemplate: provider.urlTemplate
    }))
  };
}

function safeInlineScript(source) {
  return String(source).replace(/<\/script/gi, "<\\/script");
}

function buildHtmlInjection() {
  const pageScript = fs.readFileSync(path.join(root, SELECTION_LOOKUP_SOURCE_PATH), "utf8");
  const configScript = `window.__SURGE_DICTIONARY_CONFIG__=${JSON.stringify(pageConfig())};`;

  return [
    "<!--surge-dictionary-overlay-->",
    `<script data-surge-dictionary-overlay="1">${safeInlineScript(configScript)}</script>`,
    `<script data-surge-dictionary-overlay="1">${safeInlineScript(pageScript)}</script>`
  ].join("");
}

function buildScriptLines(options = {}) {
  return config.sites.map((site) => {
    const parameters = [
      "type=http-response",
      `pattern=${siteHtmlPattern(site)}`,
      "requires-body=1",
      "max-size=0",
      "timeout=3",
      `script-path=${scriptPath(INJECTOR_SCRIPT_PATH, options)}`
    ];

    if (options.scriptUpdateInterval) {
      parameters.push(`script-update-interval=${options.scriptUpdateInterval}`);
    }

    return `${scriptName(site)} = ${parameters.join(", ")}`;
  });
}

function buildFrameHeaderLines() {
  return frameHosts().flatMap((host) => {
    return (config.defaults.frameHeaderDeletes || []).map((name) => {
      return `http-response ^https:\\/\\/${frameHostPattern(host)}\\/ header-del ${name}`;
    });
  });
}

function buildModule(options = {}) {
  const metadata = config.metadata;
  const mitmHosts = unique([
    ...config.sites.flatMap(htmlMitmHosts),
    ...frameHosts()
  ]);

  return [
    [
      `#!name=${metadata.name}`,
      `#!desc=${metadata.desc}`,
      `#!author=${metadata.author}`,
      `#!requirement=${metadata.requirement}`,
      "#!generated-from=dictionary.config.js via scripts/build_dictionary.js",
      ""
    ].join("\n"),
    section("Header Rewrite", [
      "# Let online dictionary pages render inside the in-page iframe tabs.",
      ...buildFrameHeaderLines()
    ]),
    section("Script", [
      "# Injects a small page overlay on selected HTML documents only.",
      ...buildScriptLines(options)
    ]),
    section("MITM", [
      `hostname = %APPEND% ${mitmHosts.join(", ")}`
    ])
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

function buildInjector() {
  return `// Generated from dictionary.config.js by scripts/build_dictionary.js. Do not edit by hand.
const INJECTION_MARKER = "surge-dictionary-overlay";
const HTML_INJECTION = ${JSON.stringify(buildHtmlInjection())};
const RESPONSE_HEADER_DELETES = ${JSON.stringify(config.defaults.responseHeaderDeletes)};

function headerValue(headers, name) {
  const target = String(name).toLowerCase();
  const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === target);
  return key ? String(headers[key] || "") : "";
}

function cloneHeaders(headers) {
  const cloned = {};
  Object.keys(headers || {}).forEach((name) => {
    if (headers[name] !== undefined) {
      cloned[name] = headers[name];
    }
  });
  return cloned;
}

function deleteHeader(headers, name) {
  const target = String(name).toLowerCase();
  Object.keys(headers || {}).forEach((candidate) => {
    if (candidate.toLowerCase() === target) {
      delete headers[candidate];
    }
  });
}

function isHtmlResponse(headers, body) {
  const contentType = headerValue(headers, "Content-Type").toLowerCase();
  if (contentType.indexOf("text/html") !== -1 || contentType.indexOf("application/xhtml+xml") !== -1) {
    return true;
  }

  return /^\\s*(?:<!doctype\\s+html|<html[\\s>])/i.test(body || "");
}

function sanitizedHeaders(headers) {
  const cloned = cloneHeaders(headers);
  RESPONSE_HEADER_DELETES.forEach((name) => deleteHeader(cloned, name));
  return cloned;
}

function injectIntoHtml(body) {
  if (body.indexOf(INJECTION_MARKER) !== -1) {
    return body;
  }

  if (/<\\/body>/i.test(body)) {
    return body.replace(/<\\/body>/i, HTML_INJECTION + "</body>");
  }

  if (/<\\/html>/i.test(body)) {
    return body.replace(/<\\/html>/i, HTML_INJECTION + "</html>");
  }

  return body + HTML_INJECTION;
}

const response = typeof $response === "object" && $response ? $response : {};
const headers = response.headers || {};
const body = typeof response.body === "string" ? response.body : "";

if (!body || !isHtmlResponse(headers, body) || body.indexOf(INJECTION_MARKER) !== -1) {
  $done({});
} else {
  $done({
    headers: sanitizedHeaders(headers),
    body: injectIntoHtml(body)
  });
}
`;
}

function writeGeneratedFiles() {
  fs.mkdirSync(path.dirname(path.join(root, INJECTOR_OUTPUT_PATH)), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, LOCAL_MODULE_OUTPUT_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, MODULE_OUTPUT_PATH), buildModule({
    remoteBaseUrl: DEFAULT_REMOTE_SCRIPT_BASE_URL,
    scriptUpdateInterval: 86400
  }));
  fs.writeFileSync(path.join(root, LOCAL_MODULE_OUTPUT_PATH), buildModule());
  fs.writeFileSync(path.join(root, INJECTOR_OUTPUT_PATH), buildInjector());

  [
    "DictionaryOverlay.sgmodule",
    "DictionaryOverlay.inject_response.js",
    "inject_response.js"
  ].forEach((filename) => {
    fs.rmSync(path.join(root, filename), { force: true });
  });
}

if (require.main === module) {
  writeGeneratedFiles();
}

module.exports = {
  buildHtmlInjection,
  buildInjector,
  buildModule,
  DEFAULT_REMOTE_SCRIPT_BASE_URL,
  INJECTOR_OUTPUT_PATH,
  INJECTOR_SCRIPT_PATH,
  LOCAL_MODULE_OUTPUT_PATH,
  MODULE_FILENAME,
  MODULE_OUTPUT_PATH,
  SELECTION_LOOKUP_SOURCE_PATH,
  writeGeneratedFiles
};
