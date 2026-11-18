# Project memory

## Product intent & audience

- Expo-based mobile app with admin/store management features
- Admin dashboard ("Panel Super Admin") for payments, flash sales, accounts, support, and config
- Store/tienda functionality for publishing products/comercios with category filtering
- Weekly survey/poll creator (abiertas y cerradas) accessible from admin config
- In-app store chat system (`app/chat/tienda/[id].tsx`)
- Spanish-language UI; likely Latin American market (categories: Pollerías, Bodegas, Ferreterías)

## Brand personality & voice

- Utility-focused admin/commerce app; no expressive branding directives observed yet

## Visual design & UX direction

- Expo Router file-based structure: `app/(admin)/`, `app/(tabs)/`, `app/chat/`
- Admin tab bar: horizontal `ScrollView` with `showsHorizontalScrollIndicator={false}`; tabs: Pagos, Flash, Cuentas, Soporte, Mi QR/Config
- Design and colors must be preserved when adjusting layout
- Avoid `flex: 1` on tab items when more than ~3 tabs exist (causes compression/hidden tabs)

## Decisions, constraints & rationale

- Admin tab bar converted from `View` + `flex: 1` to horizontal `ScrollView` so all 5 tabs remain visible and tappable
- `tienda.tsx`: 4 `onSnapshot` listeners + polling interval; all have proper cleanup (`return () => unsub()`, `clearInterval`) — confirmed clean
- `app/chat/tienda/[id].tsx`: 1 Firestore listener with proper `return unsub` cleanup — confirmed clean
- Typecheck enforced and expected to pass after changes

## Open questions & assumptions

- No explicit `.bolt/prompt` global instructions exist yet
- App may have both admin and regular user roles (separate route groups `(admin)` vs `(tabs)`)
- Exact Firestore data model and collection names not yet documented
- No design system or component library decisions inferred so far