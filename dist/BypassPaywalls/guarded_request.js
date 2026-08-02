// Generated from sites.config.js by scripts/build.js. Do not edit by hand.
const SITE_RULES = {
  "bloomberg": {
    "excludePatterns": [],
    "blockRequests": [
      {
        "name": "bloomberg-fortress-client",
        "pattern": "^https://[^/]+\\.bwbx\\.io/s3/fence/fortress-client/",
        "requireRefererDomains": [
          "bloomberg.com"
        ],
        "destinations": [
          "script",
          "empty"
        ],
        "requireDestination": false,
        "contentType": "application/javascript; charset=utf-8"
      }
    ],
    "requestHeaders": []
  },
  "economist": {
    "excludePatterns": [],
    "blockRequests": [],
    "requestHeaders": [
      {
        "name": "economist-liskov-user-agent",
        "documentOnly": false,
        "destinations": [
          "document",
          "iframe",
          "empty",
          "script"
        ],
        "pattern": "^https://(?:[^/]+\\.)?economist\\.com/",
        "set": {
          "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36 Liskov"
        }
      }
    ]
  },
  "newyorker": {
    "excludePatterns": [],
    "blockRequests": [
      {
        "name": "conde-nast-root-script",
        "pattern": "^https://www\\.newyorker\\.com/[-\\w]+$",
        "requireRefererDomains": [
          "newyorker.com"
        ],
        "destinations": [
          "script"
        ],
        "requireDestination": true,
        "contentType": "application/javascript; charset=utf-8"
      }
    ],
    "requestHeaders": []
  },
  "nytimes": {
    "excludePatterns": [
      {
        "pattern": "^https://(?:www\\.)?nytimes\\.com/games/"
      }
    ],
    "blockRequests": [],
    "requestHeaders": [
      {
        "name": "nytimes-user-agent",
        "documentOnly": true,
        "pattern": "^https://(?:www\\.)?nytimes\\.com/",
        "set": {
          "User-Agent": "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)"
        }
      }
    ]
  },
  "scmp": {
    "excludePatterns": [],
    "blockRequests": [
      {
        "name": "scmp-tinypass",
        "pattern": "^https://(?:[^/]+\\.)?tinypass\\.com/",
        "requireRefererDomains": [
          "scmp.com"
        ],
        "destinations": [],
        "requireDestination": false,
        "contentType": "application/javascript; charset=utf-8"
      },
      {
        "name": "scmp-amp-access",
        "pattern": "^https://cdn\\.ampproject\\.org/v0/amp-(?:access|subscriptions)-.+\\.js(?:[?#]|$)",
        "requireRefererDomains": [
          "scmp.com"
        ],
        "destinations": [],
        "requireDestination": false,
        "contentType": "application/javascript; charset=utf-8"
      }
    ],
    "requestHeaders": []
  },
  "wsj": {
    "excludePatterns": [],
    "blockRequests": [],
    "requestHeaders": [
      {
        "name": "wsj-drudge-referer",
        "documentOnly": false,
        "destinations": [
          "document",
          "iframe",
          "empty",
          "script"
        ],
        "pattern": "^https://(?:www\\.)?wsj\\.com/",
        "set": {
          "Referer": "https://www.drudgereport.com/"
        }
      }
    ]
  },
  "washingtonpost": {
    "excludePatterns": [],
    "blockRequests": [],
    "requestHeaders": [
      {
        "name": "washingtonpost-googlebot-headers",
        "documentOnly": false,
        "destinations": [
          "document",
          "iframe",
          "empty",
          "script"
        ],
        "pattern": "^https://(?:www\\.)?washingtonpost\\.com/",
        "set": {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Referer": "https://www.google.com/",
          "X-Forwarded-For": "66.249.66.1"
        }
      }
    ]
  }
};

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
    const match = String(raw || "").match(/^https?:\/\/([^/?#]+)/i);
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
