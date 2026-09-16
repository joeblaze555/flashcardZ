/**
 * Central navigation targets.
 *
 * `TABS_HOME` (`/`) is the Decks tab — the root index route inside the
 * `(tabs)` group. It is deliberately NOT written as `/(tabs)/index`:
 * although the typed-route generator lists that form, the installed
 * router compiles a tab index to an EMPTY sub-path, so a literal trailing
 * `/index` segment has nothing to match against and resolves to the
 * Unmatched Route screen at runtime (verified by executing the real
 * getRoutes + getReactNavigationConfig + getStateFromPath pipeline
 * against this project's file list: `/` and `/(tabs)` match, while
 * `/(tabs)/index` and `/index` return undefined).
 *
 * `/` itself is absent from the generated typed-route union, hence the
 * single documented assertion below — runtime-proven, not a guess.
 */

import type { Href } from 'expo-router';

export const TABS_HOME = '/' as unknown as Href;
