# date-tracker

A local-first Expo app for couples to track their dates together. Each date is
modelled as a timeline of stops (e.g. dinner, a walk, a movie) rather than a
single event, so logging for a shareable feed produces correctly-categorised
expense data as a byproduct.

Everything runs on-device via `expo-sqlite`. There is no auth, no server and no
network call anywhere in v1.

## What's here

- **Dates** — a calendar mosaic of cover photos, a hero + two-up feed, search
- **Capture** — a five-second sheet: keypad, kind chips, live budget remaining,
  and offline receipt OCR through ML Kit
- **Compose** — reorder stops, title, cover, caption, 1–5 rating, back-dating
- **Spending** — budget bar, spend by kind and subkind, 12-month trend,
  per-date average, top places
- **Memories** — on this day, weekly streak, milestones, favourites shelf
- **Settings** — monthly budget, renaming people, light/dark theme
- **Share** — a Skia-rendered receipt at 1080×1350, with exact / range / no-money modes

## Install

```bash
npm install
```

## Run the tests

Tests run on [Vitest](https://vitest.dev/), not Jest, in plain Node with no
renderer — `src/domain/**` never imports react, react-native or expo:

```bash
npm test
```

`npm run test:watch` for watch mode. Do **not** run `npm run lint`: no ESLint
config is committed and the command rewrites `package.json`.

## Run the app

```bash
npm run ios
```

That is `expo run:ios` with three things set, all of which matter on this
machine:

- `RCT_USE_PREBUILT_RNCORE=0 EXPO_USE_PRECOMPILED_MODULES=0` — build React
  Native from source. With Expo's prebuilt `React.xcframework`, the app binary
  never links `PlatformConstants` and every launch dies with
  `TurboModuleRegistry.getEnforcing(...): 'PlatformConstants' could not be
  found`. In a Release build there is no red box, so it shows only as a
  splash screen that never goes away. Confirm with
  `strings datetracker.app/datetracker | grep -c PlatformConstants` — zero
  is the fault.
- `LANG=en_US.UTF-8` — CocoaPods 1.16 on Ruby 4 dies with
  `Unicode Normalization not appropriate for ASCII-8BIT` without it.
- `--port 8082` **and** `RCT_METRO_PORT=8082` — 8081 is held by another
  project here. `--port` only moves Metro; the port the *app* looks for is a
  compile-time define (`React-Core.debug.xcconfig` carries
  `RCT_METRO_PORT=${RCT_METRO_PORT}`), and if it is unset at build time the
  binary falls back to 8081 and launches with `No script URL provided`.
  Confirm with `strings datetracker.debug.dylib | grep -A1 RCT_METRO_PORT`.
  Changing it means a rebuild, not just a Metro restart.

The first build compiles all of React Native and takes a while. Later builds
are incremental. `npm start` starts Metro alone on 8082 for an already-built
app.

### The simulator must be iOS 18, not iOS 26

ML Kit ships fat frameworks rather than xcframeworks, so `MLKitVision`,
`MLKitCommon`, `GoogleMLKit` and `MLImage` each set
`EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`. The simulator build comes out
x86_64-only, and Xcode 26's iOS 26 runtimes have no x86_64 slice — so pick an
iOS 18.x device (iPhone 16 Pro works). The exclusion applies only to
`sdk=iphonesimulator*`; device builds are arm64 and unaffected.

### If an Xcode build dies in a React Native script phase

`ios/.xcode.env.local` pins `NODE_BINARY`. If that node is broken — a Homebrew
node linking a `libsimdjson` version that Homebrew has since replaced will
abort on launch — every RN build script fails. Point it at a working node:

```bash
echo "export NODE_BINARY=$(command -v node)" > ios/.xcode.env.local
```

That file is gitignored, so it is per-machine. Avoid a path containing spaces;
not every RN script quotes `$NODE_BINARY`.

## Conventions

- `src/domain/**` is pure: no react, react-native or expo imports
- No raw hex colours in components — colour comes from `useTheme()`
- No `fontWeight`: the Nunito family renders numeric weights as a faux-bold
  smear. Emphasis comes from `theme.type.*` tokens
- A `Card` holds content, never another `Card`
- Money is stored in integer minor units, never floats
- Every query is couple-scoped, respects `deleted_at`, and is proven by a
  mutation that must fail a test

## Docs

- Design specs: `docs/superpowers/specs/`
- Implementation plans: `docs/superpowers/plans/`
