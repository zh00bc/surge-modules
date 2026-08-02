const fs = require("fs");
const path = require("path");
const config = require("../sites.config");
const {
  expandValue,
  htmlPattern: buildHtmlPattern,
  section,
  toJsRegexSource,
  toSurgeRegex,
  unique
} = require("./surge_utils");

const root = path.resolve(__dirname, "..");
const DIST_DIR = "dist";
const MODULE_FILENAME = "BypassPaywalls.sgmodule";
const MODULE_BUNDLE_DIR = "BypassPaywalls";
const GUARDED_REQUEST_FILENAME = "guarded_request.js";
const GUARDED_REQUEST_SCRIPT_PATH = `${MODULE_BUNDLE_DIR}/${GUARDED_REQUEST_FILENAME}`;
const MODULE_OUTPUT_PATH = path.join(DIST_DIR, MODULE_FILENAME);
const LOCAL_MODULE_OUTPUT_PATH = path.join(DIST_DIR, "local", MODULE_FILENAME);
const GUARDED_REQUEST_OUTPUT_PATH = path.join(DIST_DIR, GUARDED_REQUEST_SCRIPT_PATH);
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

function htmlPattern(site) {
  return buildHtmlPattern(site, config.defaults.htmlAssetExclusion);
}

function scriptName(site) {
  if (site.scriptName) {
    return site.scriptName;
  }

  return `${site.id.replace(/(?:^|-)([a-z])/g, (_, char) => char.toUpperCase())}GuardedRequest`;
}

function guardedPattern(site) {
  if (site.guardedPattern) {
    return site.guardedPattern;
  }

  if (site.userAgent && site.userAgent.guarded) {
    return site.userAgent.match;
  }

  const headers = site.guardedHeaders || [];
  if (headers.length) {
    return headers.map((rule) => rule.match).join("|");
  }

  const blocks = site.guardedBlocks || [];
  return blocks.map((rule) => rule.match).join("|");
}

function hasGuardedBehavior(site) {
  return Boolean(guardedPattern(site)) ||
    Boolean(site.userAgent && site.userAgent.guarded) ||
    Boolean(site.guardedBlocks && site.guardedBlocks.length) ||
    Boolean(site.guardedHeaders && site.guardedHeaders.length);
}

function hasCosmetics(site) {
  return Boolean(site.hideSelectors && site.hideSelectors.length) ||
    Boolean(site.cssRules && site.cssRules.length);
}

function buildStyle(site) {
  const hideSelectors = site.hideSelectors || [];
  const hideCss = hideSelectors.length ? `${hideSelectors.join(",")}{display:none!important}` : "";
  const extraCss = (site.cssRules || []).join("");

  return `<style>${hideCss}${extraCss}</style>`;
}

function buildBodyRewrite(site) {
  return `http-response ${htmlPattern(site)} </head> <!--surge-bpc-cosmetic:${site.id}-->${buildStyle(site)}</head>`;
}

function buildUrlRewriteLines() {
  return config.sites.flatMap((site) => {
    return (site.blockRules || []).map((pattern) => `${toSurgeRegex(pattern, site)} _ reject`);
  });
}

function buildRequestHeaderLines() {
  return config.sites.flatMap((site) => {
    const lines = [];

    if (site.referer) {
      const match = toSurgeRegex(site.referer.match, site);
      lines.push(`http-request ${match} header-del Referer`);
      lines.push(`http-request ${match} header-add Referer ${expandValue(site.referer.value, site)}`);
    }

    (site.headerRules || []).forEach((rule) => {
      lines.push(`${rule.type || "http-request"} ${toSurgeRegex(rule.match, site)} ${rule.action}`);
    });

    return lines;
  });
}

function buildResponseHeaderLines() {
  return config.sites.flatMap((site) => {
    if (!hasCosmetics(site)) {
      return [];
    }

    return config.defaults.responseHeaderDeletes.map((name) => {
      return `http-response ${htmlPattern(site)} header-del ${name}`;
    });
  });
}

function buildScriptLines(options = {}) {
  return config.sites
    .filter(hasGuardedBehavior)
    .map((site) => {
      const parameters = [
        `type=http-request`,
        `pattern=${toSurgeRegex(guardedPattern(site), site)}`,
        `script-path=${scriptPath(GUARDED_REQUEST_SCRIPT_PATH, options)}`,
        `argument=site=${site.id}`,
        `timeout=3`
      ];

      if (options.scriptUpdateInterval) {
        parameters.push(`script-update-interval=${options.scriptUpdateInterval}`);
      }

      return `${scriptName(site)} = ${parameters.join(", ")}`;
    });
}

function buildModule(options = {}) {
  const urlRewriteLines = buildUrlRewriteLines();
  const requestHeaderLines = buildRequestHeaderLines();
  const responseHeaderLines = buildResponseHeaderLines();
  const bodyRewriteLines = config.sites
    .filter(hasCosmetics)
    .map(buildBodyRewrite);
  const scriptLines = buildScriptLines(options);
  const mitmHosts = unique(config.sites.flatMap((site) => {
    return (site.mitmHosts || []).map((host) => expandValue(host, site));
  }));
  const metadata = config.metadata;

  return [
    [
      `#!name=${metadata.name}`,
      `#!desc=${metadata.desc}`,
      `#!author=${metadata.author}`,
      `#!requirement=${metadata.requirement}`,
      "#!generated-from=sites.config.js via scripts/build.js",
      ""
    ].join("\n"),
    section("URL Rewrite", [
      "# Pure URL blocks from the BPC site rules.",
      ...urlRewriteLines
    ]),
    section("Header Rewrite", [
      "# Header rewrites that do not require request context.",
      ...requestHeaderLines,
      "",
      "# Let Body Rewrite adjust HTML safely.",
      ...responseHeaderLines
    ]),
    section("Body Rewrite", [
      "# CSS-only cosmetics. No runtime DOM mutation, so hydration stays under the site's control.",
      ...bodyRewriteLines
    ]),
    section("Script", [
      "# Only contexts that Surge's declarative rules cannot express stay in JS.",
      ...scriptLines
    ]),
    section("MITM", [
      `hostname = %APPEND% ${mitmHosts.join(", ")}`
    ])
  ].join("\n").replace(/\n{3,}/g, "\n\n");
}

function requestHeaderRules(site) {
  const rules = [];

  if (site.userAgent && site.userAgent.guarded) {
    rules.push({
      name: `${site.id}-user-agent`,
      documentOnly: site.userAgent.documentOnly !== false,
      pattern: toJsRegexSource(site.userAgent.match, site),
      set: {
        "User-Agent": site.userAgent.value
      }
    });
  }

  (site.guardedHeaders || []).forEach((rule) => {
    rules.push({
      name: rule.name || `${site.id}-headers`,
      documentOnly: rule.documentOnly === true,
      destinations: rule.destinations || [],
      pattern: toJsRegexSource(rule.match, site),
      set: expandHeaderSet(rule.set || {}, site)
    });
  });

  return rules;
}

function excludePatterns(site) {
  return [
    ...(site.excludePatterns || []),
    ...((site.userAgent && site.userAgent.exclude) || [])
  ].map((pattern) => ({ pattern: toJsRegexSource(pattern, site) }));
}

function blockRequests(site) {
  return (site.guardedBlocks || []).map((rule) => ({
    name: rule.name,
    pattern: toJsRegexSource(rule.match, site),
    requireRefererDomains: (rule.requireRefererDomains || []).map((domain) => expandValue(domain, site)),
    destinations: rule.destinations || [],
    requireDestination: rule.requireDestination === true,
    contentType: rule.contentType || "application/javascript; charset=utf-8"
  }));
}

function expandHeaderSet(headers, site) {
  return Object.keys(headers).reduce((expanded, name) => {
    expanded[name] = expandValue(headers[name], site);
    return expanded;
  }, {});
}

function buildSiteRulesLiteral() {
  const guardedSites = {};

  config.sites.filter(hasGuardedBehavior).forEach((site) => {
    guardedSites[site.id] = {
      excludePatterns: excludePatterns(site),
      blockRequests: blockRequests(site),
      requestHeaders: requestHeaderRules(site)
    };
  });

  return JSON.stringify(guardedSites, null, 2);
}

function buildGuardedRequest() {
  return `// Generated from sites.config.js by scripts/build.js. Do not edit by hand.
const SITE_RULES = ${buildSiteRulesLiteral()};

function compilePattern(pattern) {
  return new RegExp(pattern, "i");
}

Object.keys(SITE_RULES).forEach((site) => {
  const rules = SITE_RULES[site];
  rules.excludePatterns = (rules.excludePatterns || []).map((entry) => compilePattern(entry.pattern));
  rules.blockRequests = (rules.blockRequests || []).map((rule) => Object.assign({}, rule, {
    pattern: compilePattern(rule.pattern)
  }));
  rules.requestHeaders = (rules.requestHeaders || []).map((rule) => Object.assign({}, rule, {
    pattern: compilePattern(rule.pattern)
  }));
});

function parseArgument(raw) {
  return String(raw || "").split("&").reduce((params, part) => {
    if (!part) {
      return params;
    }

    const separator = part.indexOf("=");
    const key = separator === -1 ? part : part.slice(0, separator);
    const value = separator === -1 ? "" : part.slice(separator + 1);
    params[decodeURIComponent(key)] = decodeURIComponent(value);
    return params;
  }, {});
}

function parseUrl(raw) {
  try {
    return new URL(raw);
  } catch (error) {
    const match = String(raw || "").match(/^https?:\\/\\/([^/?#]+)/i);
    return match ? { hostname: match[1].toLowerCase() } : { hostname: "" };
  }
}

function hostMatches(hostname, domains) {
  const host = String(hostname || "").toLowerCase();
  return (domains || []).some((domain) => {
    const normalized = String(domain || "").toLowerCase();
    return host === normalized || host.endsWith("." + normalized);
  });
}

function findHeaderKey(headers, name) {
  const target = name.toLowerCase();
  return Object.keys(headers || {}).find((key) => key.toLowerCase() === target);
}

function getHeader(headers, name) {
  const key = findHeaderKey(headers, name);
  return key ? String(headers[key] || "") : "";
}

function setHeader(headers, name, value) {
  const key = findHeaderKey(headers, name) || name;
  headers[key] = value;
}

function isDocumentRequest(headers) {
  const destination = getHeader(headers, "Sec-Fetch-Dest").toLowerCase();
  const accept = getHeader(headers, "Accept").toLowerCase();

  return destination === "document" ||
    destination === "iframe" ||
    accept.indexOf("text/html") !== -1 ||
    accept.indexOf("application/xhtml+xml") !== -1;
}

function matchesRequestDestinations(headers, destinations, requireDestination) {
  if (!destinations || !destinations.length) {
    return true;
  }

  const destination = getHeader(headers, "Sec-Fetch-Dest").toLowerCase();
  if (!destination) {
    return !requireDestination;
  }

  return destinations.indexOf(destination) !== -1;
}

function hasRequiredReferer(headers, domains) {
  if (!domains || !domains.length) {
    return true;
  }

  return hostMatches(parseUrl(getHeader(headers, "Referer")).hostname, domains);
}

function isExcluded(url, rules) {
  return (rules.excludePatterns || []).some((pattern) => pattern.test(url));
}

function findBlockedRequest(url, headers, rules) {
  if (isDocumentRequest(headers) || isExcluded(url, rules)) {
    return null;
  }

  return (rules.blockRequests || []).find((rule) => {
    return rule.pattern.test(url) &&
      matchesRequestDestinations(headers, rule.destinations, rule.requireDestination) &&
      hasRequiredReferer(headers, rule.requireRefererDomains);
  }) || null;
}

function applyRequestHeaders(url, headers, rules) {
  let changed = false;
  const documentRequest = isDocumentRequest(headers);

  if (isExcluded(url, rules)) {
    return {};
  }

  (rules.requestHeaders || []).forEach((rule) => {
    if ((rule.documentOnly && !documentRequest) ||
      !matchesRequestDestinations(headers, rule.destinations, rule.requireDestination) ||
      !rule.pattern.test(url)) {
      return;
    }

    Object.keys(rule.set || {}).forEach((name) => {
      const value = rule.set[name];
      if (getHeader(headers, name) !== value) {
        setHeader(headers, name, value);
        changed = true;
      }
    });
  });

  return changed ? { headers } : {};
}

function blockedResponse(rule) {
  return {
    response: {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": rule.contentType,
        "X-Surge-BPC-Rule": rule.name
      },
      body: ""
    }
  };
}

const args = parseArgument(typeof $argument === "string" ? $argument : "");
const requestUrl = typeof $request !== "undefined" ? $request.url : "";
const headers = Object.assign({}, typeof $request !== "undefined" ? ($request.headers || {}) : {});
const rules = SITE_RULES[args.site];
const blockedRule = rules ? findBlockedRequest(requestUrl, headers, rules) : null;

$done(blockedRule ? blockedResponse(blockedRule) : (rules ? applyRequestHeaders(requestUrl, headers, rules) : {}));
`;
}

function writeGeneratedFiles() {
  fs.mkdirSync(path.dirname(path.join(root, GUARDED_REQUEST_OUTPUT_PATH)), { recursive: true });
  fs.mkdirSync(path.dirname(path.join(root, LOCAL_MODULE_OUTPUT_PATH)), { recursive: true });
  fs.writeFileSync(path.join(root, MODULE_OUTPUT_PATH), buildModule({
    remoteBaseUrl: DEFAULT_REMOTE_SCRIPT_BASE_URL,
    scriptUpdateInterval: 86400
  }));
  fs.writeFileSync(path.join(root, LOCAL_MODULE_OUTPUT_PATH), buildModule());
  fs.writeFileSync(path.join(root, GUARDED_REQUEST_OUTPUT_PATH), buildGuardedRequest());

  [
    "BypassPaywalls.sgmodule",
    "BypassPaywalls.guarded_request.js",
    "guarded_request.js"
  ].forEach((filename) => {
    fs.rmSync(path.join(root, filename), { force: true });
  });
}

if (require.main === module) {
  writeGeneratedFiles();
}

module.exports = {
  buildGuardedRequest,
  buildModule,
  DEFAULT_REMOTE_SCRIPT_BASE_URL,
  GUARDED_REQUEST_OUTPUT_PATH,
  GUARDED_REQUEST_FILENAME,
  GUARDED_REQUEST_SCRIPT_PATH,
  LOCAL_MODULE_OUTPUT_PATH,
  MODULE_FILENAME,
  MODULE_OUTPUT_PATH,
  writeGeneratedFiles
};
