# Self-hosted fonts

These files are vendored so the build never depends on a network fetch.

`next/font/google` self-hosts fonts by downloading the `.woff2` from
`fonts.gstatic.com` **at build time** and emitting it as a static asset. That
makes every deployment contingent on that fetch succeeding. When it doesn't,
Turbopack cannot materialise its internal font module and the build dies with:

```
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
```

with the failing `src: url(@vercel/turbopack-next/internal/font/google/font?{"url":"https://fonts.gs...` in the generated `@font-face`. A partially written
font in a restored `.next/cache` reproduces it on every subsequent build until
the cache is dropped. Shipping the files removes the failure mode entirely.

## What's here

Latin subset only, matching the `subsets: ["latin"]` the Google loader was
asked for. Four of the five families ship as variable fonts, so one file covers
every weight; Poppins has no variable version, hence its four statics.

| File | Family | Weight | Style | Used by |
|---|---|---|---|---|
| `PlusJakartaSans-Variable.woff2` | Plus Jakarta Sans | 200–800 | normal | `src/app/layout.tsx` (`--font-sans`) |
| `GeistMono-Variable.woff2` | Geist Mono | 100–900 | normal | `src/app/layout.tsx` (`--font-geist-mono`) |
| `Oswald-Variable.woff2` | Oswald | 200–700 | normal | franchise card (`--card-oswald`) |
| `PlayfairDisplay-Variable.woff2` | Playfair Display | 400–900 | normal | franchise card (`--card-playfair`) |
| `Poppins-Regular.woff2` | Poppins | 400 | normal | franchise card (`--card-poppins`) |
| `Poppins-Italic.woff2` | Poppins | 400 | italic | franchise card |
| `Poppins-Bold.woff2` | Poppins | 700 | normal | franchise card |
| `Poppins-BoldItalic.woff2` | Poppins | 700 | italic | franchise card |

All eight are ~150 KB in total, and all five families are licensed under the
SIL Open Font License 1.1, which permits redistribution.

The loaders are declared in the two files that use them rather than in a shared
module here, so each route still pulls only its own fonts — the franchise card's
three families must not be preloaded on every dashboard page.

## Refreshing them

Ask the Google Fonts CSS API for the family with a browser `User-Agent` (it
serves `.woff2` and the variable file only to modern browsers), take the `src`
from the block commented `/* latin */`, and download it. For example:

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
curl -s -A "$UA" "https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap"
```

If you change a file, update the `weight` range in the matching `localFont()`
call to the range the new file actually covers.
