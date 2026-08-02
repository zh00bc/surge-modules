function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandDomainTemplate(text, site, { regex = false } = {}) {
  const domain = regex ? escapeRegex(site.domain) : site.domain;

  if (!regex) {
    return String(text).replace(/\{domain\}/g, domain);
  }

  return String(text)
    .replace(/\.\{domain\}/g, `\\.${domain}`)
    .replace(/\{domain\}/g, domain);
}

function toSurgeRegex(pattern, site) {
  return expandDomainTemplate(pattern, site, { regex: true }).replace(/\//g, "\\/");
}

function toJsRegexSource(pattern, site) {
  return expandDomainTemplate(pattern, site, { regex: true });
}

function expandValue(value, site) {
  return expandDomainTemplate(value, site);
}

function hostPattern(site) {
  const domain = escapeRegex(site.domain);
  const hosts = site.htmlHosts || ["www"];
  const includesBare = hosts.includes("");
  const namedHosts = hosts.filter(Boolean).map(escapeRegex);

  if (!namedHosts.length) {
    return domain;
  }

  if (includesBare && namedHosts.length === 1) {
    return `(?:${namedHosts[0]}\\.)?${domain}`;
  }

  if (includesBare) {
    return `(?:(?:${namedHosts.join("|")})\\.)?${domain}`;
  }

  if (namedHosts.length === 1) {
    return `${namedHosts[0]}\\.${domain}`;
  }

  return `(?:${namedHosts.join("|")})\\.${domain}`;
}

function htmlPattern(site, assetExclusion) {
  if (site.htmlPattern) {
    return toSurgeRegex(site.htmlPattern, site);
  }

  return `^https:\\/\\/${hostPattern(site)}\\/${assetExclusion}`;
}

function section(name, lines) {
  const normalized = lines.filter((line) => line !== undefined && line !== null);

  if (!normalized.length) {
    return "";
  }

  return [`[${name}]`, ...normalized, ""].join("\n");
}

module.exports = {
  escapeRegex,
  expandDomainTemplate,
  expandValue,
  hostPattern,
  htmlPattern,
  section,
  toJsRegexSource,
  toSurgeRegex,
  unique
};
