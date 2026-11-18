# Project memory

## Product intent & audience

- Expo-based mobile app named **TamboRuta** (`appId: com.chofera.tambogrande`)
- Admin dashboard ("Panel Super Admin") for payments, flash sales, accounts, support, and config
- Store/tienda functionality for publishing products/comercios with category filtering
- Weekly survey/poll creator (abiertas y cerradas) accessible from admin config
- In-app store chat system (`app/chat/tienda/[id].tsx`)
- Spanish-language UI; likely Latin American market (categories: Pollerías, Bodegas, Ferreterías)
- Deployed/built via **Ionic Appflow** with Capacitor wrapper around Expo web export

## Brand personality & voice

- Utility-focused admin/commerce app; no expressive branding directives observed yet

## Visual design & UX direction

- Expo Router file-based structure: `app/(admin)/`, `app/(tabs)/`, `app/chat/`
- Admin tab bar: horizontal `ScrollView`; tabs: Pagos, Flash, Cuentas, Soporte, Mi QR/Config
- Tab bar scrollbar visible (`showsHorizontalScrollIndicator={true}`) with lateral padding on content so right-edge tabs (Soporte, Config) are discoverable
- Design and colors must be preserved when adjusting layout
- Avoid `flex: 1` on tab items when more than ~3 tabs exist (causes compression/hidden tabs)

## Decisions, constraints & rationale

- Admin tab bar converted from `View` + `flex: 1` to horizontal `ScrollView` so all 5 tabs remain visible and tappable
- Scrollbar made visible + ~6px lateral padding added to signal that Soporte/Config tabs are reachable by scrolling right
- `tienda.tsx`: 4 `onSnapshot` listeners + polling interval; all have proper cleanup (`return () => unsub()`, `clearInterval`) — confirmed clean
- `app/chat/tienda/[id].tsx`: 1 Firestore listener with proper `return unsub` cleanup — confirmed clean
- Typecheck enforced and expected to pass after changes
- `capacitor.config.json` created at project root with `appId: "com.chofera.tambogrande"`, `appName: "TamboRuta"`, `webDir: "dist"`, `bundledWebRuntime: false` — required for Ionic Appflow to recognize the project and avoid "native type is capacitor but capacitor.config.json is not available" error
- `package.json` already had `build:web` script; added generic `"build"` script (Appflow expects this name) pointing to `expo export`
- `webDir` set to `dist` — must match Expo export output directory

## Open questions & assumptions

- No explicit `.bolt/prompt` global instructions exist yet
- App may have both admin and regular user roles (separate route groups `(admin)` vs `(tabs)`)
- Exact Firestore data model and collection names not yet documented
- No design system or component library decisions inferred so far
- Whether additional Capacitor native plugins or configuration beyond `capacitor.config.json` are needed for Appflow builds is not yet determined