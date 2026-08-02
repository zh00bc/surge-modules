const HTML_ASSET_EXCLUSION = "(?!.*\\.(?:css|js|mjs|json|xml|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|m4v|mov|m3u8|ts|mp3|aac|pdf)(?:[?#]|$))";

module.exports = {
  defaults: {
    htmlAssetExclusion: HTML_ASSET_EXCLUSION
  },
  sites: [
    {
      id: "bloomberg",
      label: "Bloomberg",
      domain: "bloomberg.com",
      htmlHosts: ["", "www"]
    },
    {
      id: "economist",
      label: "The Economist",
      domain: "economist.com",
      htmlHosts: ["", "www"]
    },
    {
      id: "newyorker",
      label: "New Yorker",
      domain: "newyorker.com",
      htmlHosts: ["www"]
    },
    {
      id: "theatlantic",
      label: "The Atlantic",
      domain: "theatlantic.com",
      htmlHosts: ["www"]
    },
    {
      id: "nytimes",
      label: "New York Times",
      domain: "nytimes.com",
      htmlHosts: ["", "www"]
    },
    {
      id: "scmp",
      label: "South China Morning Post",
      domain: "scmp.com",
      htmlHosts: ["", "www", "amp"]
    },
    {
      id: "wsj",
      label: "Wall Street Journal",
      domain: "wsj.com",
      htmlHosts: ["", "www"]
    },
    {
      id: "washingtonpost",
      label: "The Washington Post",
      domain: "washingtonpost.com",
      htmlHosts: ["", "www"]
    }
  ]
};
