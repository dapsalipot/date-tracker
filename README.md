# date-tracker

A local-first Expo app for couples to track their dates together. Each date
is modelled as a timeline of stops (e.g. dinner, a walk, a movie) rather than
a single event.

This project is in early scaffolding — the app currently has no screens
beyond the Expo Router default, and the test suite is a single smoke test.

## Install

```bash
npm install
```

## Run the dev server

```bash
npx expo start
```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

This project uses [file-based routing](https://docs.expo.dev/router/introduction)
via the **app** directory.

## Run tests

Tests run on [Vitest](https://vitest.dev/), not Jest:

```bash
npm test
```

Use `npm run test:watch` for a watch-mode run during development.

## Docs

- Design spec: `docs/superpowers/specs/`
- Implementation plan: `docs/superpowers/plans/`
