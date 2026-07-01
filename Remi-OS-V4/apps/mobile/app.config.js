// Expo app config. Migrated from app.json on 2026-05-25 so the iOS
// Google Maps SDK API key can be read from the environment at build
// time (via EAS Secrets) instead of being committed to git.
//
// EAS Secret wiring:
//   1. Generate an iOS-restricted Google Maps SDK key in GCP Console
//      (APIs & Services → Credentials → Create credentials → API key,
//      then restrict to iOS apps with bundle ID com.remiservice.technician).
//   2. Store on the EAS project:
//        eas secret:create --scope project \
//          --name GOOGLE_MAPS_IOS_API_KEY --value <key>
//   3. EAS injects it as `process.env.GOOGLE_MAPS_IOS_API_KEY` at
//      `eas build` time. Local dev (Metro + dev-client) reads it from
//      a `.env` file or shell export of the same name — without it,
//      the iOS Google Maps SDK falls back to a blank-tile state at
//      launch (no crash; map is visually empty until the key arrives).
//
// Why migrate from app.json: Expo's app.json doesn't interpolate env
// vars; app.config.js does. The two files are equivalent otherwise
// (Expo prefers app.config.{js,ts} when both exist, so app.json is
// removed in this PR to avoid drift).

const googleMapsIosApiKey = process.env.GOOGLE_MAPS_IOS_API_KEY ?? "";

module.exports = {
  expo: {
    name: "REMITechnician",
    slug: "REMITechnician",
    version: "2.5.7",
    orientation: "default",
    icon: "./assets/images/icon.png",
    // Single primary scheme — expo-linking warns when `scheme` is an array
    // (it always picks the first entry). Legacy `remi://` links are kept via
    // platform intent filters below, not a second expo.scheme entry.
    scheme: "remitechnician",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.remiservice.technician",
      buildNumber: "25",
      infoPlist: {
        CFBundleURLTypes: [
          {
            CFBundleURLSchemes: ["remi"],
          },
        ],
      },
      config: {
        usesNonExemptEncryption: false,
        // iOS Google Maps SDK key. Required for `<MapView
        // provider={PROVIDER_GOOGLE}>` (see
        // src/components/route/franchise-route-map.tsx +
        // src/components/route/route-map-view.tsx). Empty string at
        // build time = blank tiles at runtime (still renders; just
        // no map data). Set via EAS Secrets per the header comment.
        //
        // 2026-05-25 v2.5.6 build 24 — this key alone is NOT enough.
        // The `react-native-maps` config plugin entry below is what
        // tells Expo's prebuild step to link the AirGoogleMaps native
        // module into the iOS Pods/Xcode project. v2.5.5 build 23
        // shipped with this key but no plugin entry, so the iOS
        // binary linked the Apple-Maps-only variant and the runtime
        // logged "react-native-maps: AirGoogleMaps dir must be added
        // to your xCode project to support GoogleMaps on iOS" on
        // every map render. Both pieces are required.
        googleMapsApiKey: googleMapsIosApiKey,
      },
    },
    android: {
      package: "com.remiservice.technician",
      intentFilters: [
        {
          action: "VIEW",
          category: ["DEFAULT", "BROWSABLE"],
          data: [{ scheme: "remi" }],
        },
      ],
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/images/android-icon-foreground.png",
        backgroundImage: "./assets/images/android-icon-background.png",
        monochromeImage: "./assets/images/android-icon-monochrome.png",
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.USE_BIOMETRIC",
        "android.permission.USE_FINGERPRINT",
      ],
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
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: {
            backgroundColor: "#000000",
          },
        },
      ],
      [
        "expo-camera",
        {
          cameraPermission:
            "MAXI needs camera access to scan license plates and VIN barcodes.",
        },
      ],
      [
        "expo-image-picker",
        {
          cameraPermission:
            "REMI needs camera access to capture vehicle photos for VIN and plate scanning.",
          photosPermission:
            "REMI needs photo library access so you can choose vehicle photos.",
        },
      ],
      [
        "expo-local-authentication",
        {
          faceIDPermission: "REMI uses Face ID to quickly unlock the app.",
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            deploymentTarget: "16.0",
          },
        },
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/images/icon.png",
          color: "#3B82F6",
        },
      ],
      "@react-native-community/datetimepicker",
      [
        "@sentry/react-native/expo",
        {
          url: "https://sentry.io/",
          organization: "remi-v0",
          project: "remi-technician",
        },
      ],
      ["@stripe/stripe-react-native", {}],
      // 2026-05-25 v2.5.6 build 24 — required to link AirGoogleMaps
      // native module on iOS. Without this plugin entry, the iOS
      // build of react-native-maps omits Google Maps support even
      // when `ios.config.googleMapsApiKey` (above) is set, and
      // `<MapView provider={PROVIDER_GOOGLE}>` throws "AirGoogleMaps
      // dir must be added to your xCode project to support
      // GoogleMaps on iOS" at every render — which is exactly what
      // build 23 shipped with. The plugin is only available in
      // react-native-maps@1.22+; bumped from 1.20.1 → 1.27.2 in
      // this same commit so app.plugin.js is present.
      //
      // The plugin's `iosGoogleMapsApiKey` option writes `GMSApiKey`
      // to the iOS Info.plist at prebuild time, which is the same
      // value `ios.config.googleMapsApiKey` writes via Expo's static
      // config. Setting both with the same value is idempotent.
      [
        "react-native-maps",
        {
          iosGoogleMapsApiKey: googleMapsIosApiKey,
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      urlScheme: "remitechnician",
      router: {},
      eas: {
        projectId: "a06c86b3-2aa3-45b9-84f3-2b8d71eeccdf",
      },
    },
    owner: "jace88",
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/a06c86b3-2aa3-45b9-84f3-2b8d71eeccdf",
    },
  },
};
