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
npx expo start --dev-client
```

### The iOS Simulator does not work on Apple Silicon

**Use a physical iPhone.** ML Kit ships fat frameworks rather than
xcframeworks, so `MLKitVision`, `MLKitCommon`, `GoogleMLKit` and `MLImage` each
set `EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64`, which propagates to the app
target through `Pods-datetracker.debug.xcconfig`. The simulator build therefore
comes out x86_64-only, and Xcode 26 no longer runs x86_64 simulator apps.

The symptom is not obvious. The app launches, then throws:

```
Invariant Violation: TurboModuleRegistry.getEnforcing(...):
'PlatformConstants' could not be found.
```

In a Release build there is no red box, so it shows only as a splash screen
that never goes away. Confirm the cause with:

```bash
lipo -info ios/build/Build/Products/Debug-iphonesimulator/datetracker.app/datetracker
```

`architecture: x86_64` on an arm64 Mac is the fault. The exclusion applies only
to `sdk=iphonesimulator*`, so device builds are arm64 and unaffected — nothing
is wrong with the app itself. Restoring the simulator would mean dropping the
OCR pod from simulator builds, which costs nothing to test (a simulator has no
camera) but has not been done.

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
