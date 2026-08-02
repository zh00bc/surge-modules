const HTML_ASSET_EXCLUSION = "(?!.*\\.(?:css|js|mjs|json|xml|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp4|m4v|mov|m3u8|ts|mp3|aac|pdf)(?:[?#]|$))";

const BPC_HEADER_DESTINATIONS = ["document", "iframe", "empty", "script"];
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const ECONOMIST_LISKOV_UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36 Liskov";

const RESPONSE_HEADER_DELETES = [
  "Content-Length",
  "Content-Security-Policy",
  "Content-Security-Policy-Report-Only"
];

const config = {
  metadata: {
    name: "Bypass Paywalls for Surge",
    desc: "Module-first, BPC-inspired request blocking, header rewrites, and light cosmetic cleanup for selected news sites. Enable Surge MITM certificate first.",
    author: "LFA",
    requirement: "CORE_VERSION>=20"
  },
  defaults: {
    htmlAssetExclusion: HTML_ASSET_EXCLUSION,
    responseHeaderDeletes: RESPONSE_HEADER_DELETES
  },
  sites: [
    {
      id: "bloomberg",
      label: "Bloomberg",
      domain: "bloomberg.com",
      htmlHosts: ["", "www"],
      mitmHosts: ["{domain}", "*.{domain}", "*.bwbx.io"],
      guardedPattern: "^https://[^/]+\\.bwbx\\.io/s3/fence/fortress-client/",
      scriptName: "BloombergGuardedRequest",
      guardedBlocks: [
        {
          name: "bloomberg-fortress-client",
          match: "^https://[^/]+\\.bwbx\\.io/s3/fence/fortress-client/",
          requireRefererDomains: ["{domain}"],
          destinations: ["script", "empty"],
          contentType: "application/javascript; charset=utf-8"
        }
      ]
    },
    {
      id: "economist",
      label: "The Economist",
      domain: "economist.com",
      htmlHosts: ["", "www"],
      mitmHosts: ["{domain}", "*.{domain}"],
      blockRules: [
        "^https://(?:[^/]+\\.)?{domain}/zephr/feature",
        "^https://(?:[^/]+\\.)?{domain}/(?:latest/wall-ui|script)\\.js(?:[?#]|$)"
      ],
      guardedHeaders: [
        {
          name: "economist-liskov-user-agent",
          match: "^https://(?:[^/]+\\.)?{domain}/",
          destinations: BPC_HEADER_DESTINATIONS,
          set: {
            "User-Agent": ECONOMIST_LISKOV_UA
          }
        }
      ],
      hideSelectors: [
        "div[class^=\"adComponent_advert__\"]",
        "div[class^=\"adComponent_adcontainer__\"]",
        "div[data-testid=\"right-hand-rail-ads\"]",
        "div#airship-masthead-banner",
        "div[id^=\"econ-\"]",
        "div[id^=\"econtop-\"]",
        "div[id^=\"econright-\"]"
      ]
    },
    {
      id: "newyorker",
      label: "New Yorker",
      domain: "newyorker.com",
      htmlHosts: ["www"],
      mitmHosts: ["www.{domain}"],
      hideSelectors: [
        "div.ad",
        "div[class*=\"AdWrapper-\"]",
        "div[class*=\"StickyMidContentAdWrapper-\"]",
        "div[class*=\"AdsSpacer-\"]",
        "aside.paywall-bar",
        "div[class^=\"MessageBannerWrapper-\"]",
        "div.ad-stickyhero",
        "div.ad_wrapper"
      ],
      guardedPattern: "^https://www.{domain}/[-\\w]+$",
      scriptName: "NewYorkerGuardedRequest",
      guardedBlocks: [
        {
          name: "conde-nast-root-script",
          match: "^https://www.{domain}/[-\\w]+$",
          requireRefererDomains: ["{domain}"],
          destinations: ["script"],
          requireDestination: true,
          contentType: "application/javascript; charset=utf-8"
        }
      ]
    },
    {
      id: "theatlantic",
      label: "The Atlantic",
      domain: "theatlantic.com",
      htmlHosts: ["www"],
      mitmHosts: ["www.{domain}"],
      blockRules: [
        "^https://www.{domain}/zephr/"
      ],
      hideSelectors: [
        "aside#paywall",
        "div[class^=\"LostInventoryMessage_\"]"
      ]
    },
    {
      id: "nytimes",
      label: "New York Times",
      domain: "nytimes.com",
      htmlHosts: ["", "www"],
      mitmHosts: ["{domain}", "*.{domain}", "mwcm.nyt.com"],
      blockRules: [
        "^https://meter-svc.{domain}/meter\\.js(?:[?#]|$)",
        "^https://(?:www\\.)?{domain}/svc/onsite-messaging/query(?:[?#]|$)",
        "^https://mwcm\\.nyt\\.com/.+\\.js(?:[?#]|$)",
        "^https://cooking.{domain}/api/.+/access(?:[?#]|$)"
      ],
      userAgent: {
        value: "Mozilla/5.0 (compatible; Google-InspectionTool/1.0)",
        match: "^https://(?:www\\.)?{domain}/",
        exclude: [
          "^https://(?:www\\.)?{domain}/games/"
        ],
        documentOnly: true,
        guarded: true
      },
      guardedPattern: "^https://(?:www\\.)?{domain}/(?!games/)",
      scriptName: "NewYorkTimesGuardedRequest",
      hideSelectors: [
        "div#dock-container",
        "div#top-wrapper",
        "div#bottom-wrapper",
        "div[class$=\"ad-wrapper\"]",
        "div[class^=\"adunit_\"]",
        "div[data-testid^=\"Dropzone-\"]"
      ]
    },
    {
      id: "scmp",
      label: "South China Morning Post",
      domain: "scmp.com",
      htmlHosts: ["", "www", "amp"],
      mitmHosts: ["{domain}", "*.{domain}", "*.tinypass.com", "cdn.ampproject.org"],
      hideSelectors: [
        "div[data-qa=\"GenericArticle-PaywallContainer\"]",
        "div.js-reading-0-percent-completion-tracker",
        "div[id^=\"default-meter-page-views\"]",
        "div.ad-banner",
        "div.advert-fly-carpet-container",
        "div.inline-advert"
      ],
      guardedPattern: "^https://(?:[^/]+\\.)?tinypass\\.com/|^https://cdn\\.ampproject\\.org/v0/amp-(?:access|subscriptions)-",
      scriptName: "ScmpGuardedRequest",
      guardedBlocks: [
        {
          name: "scmp-tinypass",
          match: "^https://(?:[^/]+\\.)?tinypass\\.com/",
          requireRefererDomains: ["{domain}"],
          contentType: "application/javascript; charset=utf-8"
        },
        {
          name: "scmp-amp-access",
          match: "^https://cdn\\.ampproject\\.org/v0/amp-(?:access|subscriptions)-.+\\.js(?:[?#]|$)",
          requireRefererDomains: ["{domain}"],
          contentType: "application/javascript; charset=utf-8"
        }
      ]
    },
    {
      id: "wsj",
      label: "Wall Street Journal",
      domain: "wsj.com",
      htmlHosts: ["", "www"],
      mitmHosts: ["{domain}", "*.{domain}"],
      scriptName: "WallStreetJournalGuardedRequest",
      guardedHeaders: [
        {
          name: "wsj-drudge-referer",
          match: "^https://(?:www\\.)?{domain}/",
          destinations: BPC_HEADER_DESTINATIONS,
          set: {
            "Referer": "https://www.drudgereport.com/"
          }
        }
      ],
      hideSelectors: [
        ".snippet-promotion",
        "div[id*=\"-snippet-overlay\"]",
        "div.wsj-ad",
        "div.adWrapper",
        "div.css-xgokil-Box",
        "div#cx-article-cover-overlay",
        "div#dianomi-module"
      ]
    },
    {
      id: "washingtonpost",
      label: "The Washington Post",
      domain: "washingtonpost.com",
      htmlHosts: ["", "www"],
      mitmHosts: ["{domain}", "*.{domain}"],
      scriptName: "WashingtonPostGuardedRequest",
      blockRules: [
        "^https://(?:[^/]+\\.)?{domain}/.+/tetro-client/"
      ],
      guardedHeaders: [
        {
          name: "washingtonpost-googlebot-headers",
          match: "^https://(?:www\\.)?{domain}/",
          destinations: BPC_HEADER_DESTINATIONS,
          set: {
            "User-Agent": GOOGLEBOT_UA,
            "Referer": "https://www.google.com/",
            "X-Forwarded-For": "66.249.66.1"
          }
        }
      ],
      hideSelectors: [
        "div[data-qa$=\"-ad\"]",
        "div#leaderboard-wrapper",
        "div[data-qa=\"subscribe-promo\"]"
      ],
      cssRules: [
        "img,div.aspect-custom,div.aspect-custom>*{filter:none!important}"
      ]
    }
  ]
};

module.exports = config;
