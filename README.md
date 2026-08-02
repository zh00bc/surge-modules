# Surge Modules

A collection of Surge `.sgmodule` modules for news-site cleanup and in-page reading tools. The repository is intentionally not tied to one module so more Surge modules can live here later.

## Modules

### Bypass Paywalls for Surge

Site-scoped, BPC-inspired cleanup for:

- `www.newyorker.com`
- `www.bloomberg.com`
- `www.economist.com`
- `www.theatlantic.com`
- `www.nytimes.com`
- `www.scmp.com`
- `www.wsj.com`
- `www.washingtonpost.com`

Install URL:

```text
https://raw.githubusercontent.com/zh00bc/surge-modules/main/dist/BypassPaywalls.sgmodule
```

### Dictionary Overlay

Optional page-selection lookup module for the same news sites. After selecting text in Safari, tap the floating lookup icon to open online dictionary tabs in the current page.

Install URL:

```text
https://raw.githubusercontent.com/zh00bc/surge-modules/main/dist/DictionaryOverlay.sgmodule
```

## Design

These modules borrow the shape of two reference projects without copying their implementation:

- Periscope's ruleset idea: keep behavior site-scoped instead of using one broad global script.
- Bypass Paywalls Clean's site rules: keep cookies, block narrow paywall script/XHR patterns before page scripts run, and use minimal request headers only where BPC does the same.
- Surge's native module sections do the heavy lifting: `[URL Rewrite]` blocks pure URL patterns, guarded request scripts apply context-sensitive access hints, and `[Body Rewrite]` injects CSS-only cosmetic cleanup.
- `sites.config.js` is the single source of truth for the paywall-cleanup module. `dist/BypassPaywalls.sgmodule`, `dist/local/BypassPaywalls.sgmodule`, and `dist/BypassPaywalls/guarded_request.js` are generated from it.
- `dictionary.sites.config.js` is the dictionary module's site list. It intentionally contains only the host metadata needed by the lookup overlay, so dictionary changes do not inherit bypass-specific third-party hosts or guarded rules.
- Dictionary lookup is a separate module, not part of the paywall rules. It injects a tiny in-page button after text selection and opens a same-page popup with online dictionary tabs when the button is tapped.

## Files

- `sites.config.js` defines each site's BPC-style rule object: base `domain`, host coverage, URL blocks, header hints, cosmetic selectors, MITM hosts, and any guarded request rules.
- `dictionary.sites.config.js` defines the dictionary overlay's HTML host coverage.
- `dictionary.config.js` defines the dictionary overlay's online providers and module defaults.
- `scripts/build.js` generates GitHub-installable and local variants of the paywall module.
- `scripts/build_dictionary.js` generates GitHub-installable and local variants of the dictionary module.
- `src/dictionary/selection_lookup.js` is the browser-side selection overlay injected by the dictionary module.
- `dist/BypassPaywalls.sgmodule` is the GitHub-installable paywall module. Its script path points to the raw GitHub URL.
- `dist/local/BypassPaywalls.sgmodule` is the generated local paywall module. Its script path is relative to the Surge profile directory.
- `dist/BypassPaywalls/guarded_request.js` is generated and handles conditions Surge cannot express declaratively, such as New Yorker root-path resource blocking, Bloomberg/SCMP referer-gated blocks, and full User-Agent/Referer header sets that need request-type guards.
- `dist/DictionaryOverlay.sgmodule` is the GitHub-installable dictionary lookup module.
- `dist/local/DictionaryOverlay.sgmodule` is the generated local dictionary lookup module.
- `dist/DictionaryOverlay/inject_response.js` injects the lookup overlay into HTML responses.
- `tests/run_tests.js` provides smoke tests for the guarded JS, generated-file drift checks, and a Surge parser check.

## Site Strategy

- Bloomberg: blocks BPC's `bwbx.io/s3/fence/fortress-client/` script only when the request is initiated by Bloomberg; no broad third-party block.
- The Economist: blocks BPC's Zephr/wall UI scripts and applies BPC's Liskov mobile user agent to document/script/XHR-like requests only.
- New Yorker: BPC-style root script block plus CSS-only ad/paywall-bar hiding. No runtime DOM cleanup.
- The Atlantic: native URL Rewrite blocks Zephr plus light CSS fallback.
- New York Times: native URL Rewrite blocks meter, onsite messaging, `mwcm.nyt.com`, and Cooking access; document requests use BPC's Google Inspection Tool user agent. Games paths are excluded.
- South China Morning Post: Tinypass and AMP access/subscription scripts are blocked only when the referer is SCMP; response cleanup is CSS-only.
- Wall Street Journal: BPC's Drudge referer is applied through a guarded request rule, so asset requests are not rewritten.
- The Washington Post: blocks BPC's `tetro-client` path and applies BPC's Googlebot headers to document/script/XHR-like requests only.

## Workflow

Edit `sites.config.js`, then run:

```sh
node scripts/build.js
node scripts/build_dictionary.js
node tests/run_tests.js
```

Do not hand-edit generated rules in `dist/BypassPaywalls.sgmodule` or `dist/BypassPaywalls/guarded_request.js`; the tests fail if generated files drift from the config.

The default generated public modules assume this GitHub raw base:

```text
https://raw.githubusercontent.com/zh00bc/surge-modules/main/dist
```

To publish from another fork, override it while building:

```sh
SURGE_MODULES_RAW_BASE=https://raw.githubusercontent.com/<owner>/<repo>/<branch>/dist node scripts/build.js
SURGE_MODULES_RAW_BASE=https://raw.githubusercontent.com/<owner>/<repo>/<branch>/dist node scripts/build_dictionary.js
```

For local Surge deployment, copy `dist/local/BypassPaywalls.sgmodule` to the profile directory as `BypassPaywalls.sgmodule`, then copy the `dist/BypassPaywalls/` folder alongside it. The local module refers to the script as `BypassPaywalls/guarded_request.js`, keeping implementation files grouped instead of flat in the profile directory.

For local dictionary deployment, keep the module files grouped in a `DictionaryOverlay/` folder in the Surge iCloud profile directory:

```text
DictionaryOverlay/DictionaryOverlay.sgmodule  # copied from dist/local/DictionaryOverlay.sgmodule
DictionaryOverlay/inject_response.js          # copied from dist/DictionaryOverlay/inject_response.js
DictionaryOverlay/Source/
```

Enable `DictionaryOverlay/DictionaryOverlay.sgmodule` as a separate local module only on devices where page-selection lookup is wanted. The `Source/` subfolder is editable source code; Surge only needs the `.sgmodule` and `inject_response.js` runtime files.

To add a site, follow the BPC-style data path:

1. Add one object to `sites.config.js` with `id`, `label`, `domain`, `htmlHosts`, `mitmHosts`, and `hideSelectors`.
2. Use `{domain}` in regex templates instead of repeating escaped hostnames. For example, `^https://www.{domain}/zephr/` generates the Surge-safe regex automatically.
3. Put pure URL blocks in `blockRules`; the generator emits `[URL Rewrite]`.
4. Use `guardedHeaders` for BPC-style access hints that should be limited to document/script/XHR-like requests, or when the header value contains spaces that Surge Header Rewrite cannot safely express.
5. Use `guardedBlocks` when the rule needs request context, such as referer checks or request destination checks.
6. Add focused tests for any guarded behavior and run the Surge parser check through `node tests/run_tests.js`.

## Dictionary Overlay

iOS Safari does not allow a Surge script to add custom items to the native text-selection menu. `DictionaryOverlay.sgmodule` therefore uses the reliable web path: after the user selects text, it shows a small icon button inside the page. Tapping the icon opens a same-page popup with tabs for the configured online dictionaries.

The overlay does not attach `preventDefault` handlers to document-level selection or context-menu events, so the native iOS selection menu remains available. SF Symbols are not used as a web dependency because Safari does not expose them as a reliable page icon font; controls use inline SVG icons instead.

On touch devices, the lookup icon docks inside the current `visualViewport` near the lower-right safe area after text selection instead of sitting next to the selected word. This keeps it away from the native iOS selection menu and keeps it visible after page zooming or visual viewport panning.

The default providers are:

- Cambridge Dictionary
- Merriam-Webster
- Collins Dictionary
- Vocabulary.com

To change providers, edit `dictionary.config.js` and update `lookup.providers`. To change supported news sites for lookup, edit `dictionary.sites.config.js`. The `{query}` placeholder is URL-encoded at popup load time. No selected text is sent anywhere until the lookup button is tapped, and additional dictionary tabs load only when selected.

## Notes

Enable and trust the Surge MITM certificate before using the module.

New Yorker intentionally has no runtime DOM cleanup in this Surge version. BPC can run cosmetic fixes as an extension content script, but response-time JavaScript injection in Surge can fight the site's own hydration near the sticky header and cause Safari flashing. Keeping New Yorker cleanup CSS-only preserves the site's own typography and page behavior while still hiding ad/paywall chrome.

Body Rewrite is limited to likely HTML URLs, and font/CSS/image/script assets are excluded by URL pattern. Response cleanup should stay CSS-only unless a site has been manually verified to need something stronger.
