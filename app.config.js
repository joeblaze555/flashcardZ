export default {
  name: "FlashCardZ",
  slug: "flashcardz",
  version: "1.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "flashcardz",
  userInterfaceStyle: "dark",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.flashcardz.app",
    buildNumber: "2",
    infoPlist: {
      UIFileSharingEnabled: true,
      LSSupportsOpeningDocumentsInPlace: true,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: "com.flashcardz.flashcardz",
    versionCode: 2,
    adaptiveIcon: {
      backgroundColor: "#0F172A",
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-icon.png",
    },
    permissions: ["VIBRATE", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"],
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#0F172A",
        image: "./assets/splash.png",
        imageWidth: 200,
        resizeMode: "contain",
        dark: {
          backgroundColor: "#0F172A",
          image: "./assets/splash.png",
        },
      },
    ],
    "expo-sqlite",
    "expo-sharing",
  ],
  updates: {
    url: "https://u.expo.dev/41d4c8fa-3165-4fdf-a47c-65df0700e213",
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "41d4c8fa-3165-4fdf-a47c-65df0700e213",
    },
  },
  owner: "titustumbamas-team",
};
