const newsConfig = require("./dictionary.sites.config");

const MAX_SELECTION_LENGTH = 120;
const DICTIONARY_PROVIDERS = [
  {
    id: "cambridge",
    label: "Cambridge Dictionary",
    urlTemplate: "https://dictionary.cambridge.org/search/english-chinese-simplified/direct/?q={query}",
    frameHosts: ["dictionary.cambridge.org"]
  },
  {
    id: "merriam-webster",
    label: "Merriam-Webster",
    urlTemplate: "https://www.merriam-webster.com/dictionary/{query}",
    frameHosts: ["www.merriam-webster.com"]
  },
  {
    id: "collins",
    label: "Collins Dictionary",
    urlTemplate: "https://www.collinsdictionary.com/dictionary/english/{query}",
    frameHosts: ["www.collinsdictionary.com"]
  },
  {
    id: "vocabulary",
    label: "Vocabulary.com",
    urlTemplate: "https://www.vocabulary.com/dictionary/{query}",
    frameHosts: ["www.vocabulary.com"]
  }
];

const dictionarySites = newsConfig.sites.map((site) => ({
  id: site.id,
  label: site.label,
  domain: site.domain,
  htmlHosts: site.htmlHosts
}));

const config = {
  metadata: {
    name: "Dictionary Overlay",
    desc: "Page selection lookup popup for configured news sites. Shows online dictionary tabs inside the current page after tapping the lookup button.",
    author: "LFA",
    requirement: "CORE_VERSION>=20"
  },
  defaults: {
    htmlAssetExclusion: newsConfig.defaults.htmlAssetExclusion,
    responseHeaderDeletes: [
      "Content-Length",
      "Content-Encoding",
      "Transfer-Encoding",
      "ETag",
      "Content-MD5",
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only"
    ],
    frameHeaderDeletes: [
      "X-Frame-Options",
      "Frame-Options",
      "Content-Security-Policy",
      "Content-Security-Policy-Report-Only"
    ]
  },
  lookup: {
    buttonLabel: "查词",
    maxSelectionLength: MAX_SELECTION_LENGTH,
    providers: DICTIONARY_PROVIDERS
  },
  sites: dictionarySites
};

module.exports = config;
