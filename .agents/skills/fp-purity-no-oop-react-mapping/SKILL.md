---
name: fp-purity-no-oop-react-mapping
description: "Swift FP-school canon: no classes/OOP anywhere below one documented app-global @Observable store; views are pure functions of value state; React ideas map 1:1 onto SwiftUI."
---

# FP-first Swift: no OOP, React ↔ SwiftUI mapping

Two hard rules:

1. **No OOP. Ever.** No `class`, no inheritance, no `ObservableObject`, no
   `@StateObject`, no `@Observable` classes (the macro still produces a
   class), no `@Model`, no SwiftData. A mechanical ripgrep guard can run in
   verification — zero matches is the invariant. Exception where the canon
   allows it: one `@Observable` store class injected via `.environment()` for
   app-global session state; the ban is absolute everywhere else
   (`NotificationCenter` singletons, `static let shared` service instances).
2. **FP-first.** Views are pure functions of state. State is value types
   (`struct`, `enum`). Logic is free functions. Side effects are `async` free
   functions invoked from `.task` / `.onChange`. Mental model mirrors React.

## React ↔ SwiftUI mapping

| React idea | Swift/SwiftUI equivalent |
|---|---|
| Component | `struct SomeView: View` |
| Props | `init` parameters |
| `useState` | `@State var x: T` |
| `useReducer` | free `reduce(&state, action)` + `@State var state: State` |
| `useEffect(..., [dep])` | `.onChange(of: dep) { _, _ in ... }` |
| `useEffect(..., [])` | `.task { ... }` (auto-cancelled with the view) |
| `useContext` | `@Environment(\.someKey)` + `EnvironmentKey` |
| `useMemo` | `let x = compute(...)` in `body`, or `@State` cached value updated in `.onChange` |
| `useCallback` | not needed — struct value equality handles diffing |
| Redux store | single top-level `@State var state: AppState` in the app root |
| `Provider` | `.environment(\.appState, $state)` threaded down the tree |
| Action dispatch | `dispatch(&state, .someAction)` — free function mutating `inout` state |
| Async thunk / saga | `async` free function returning an `Action`, awaited inside `.task` and dispatched |
| Selectors | free pure functions `(AppState) -> Derived` |
| Keys in lists | `.id(model.id)` — all domain types have an `id: UUID` or slug |
| `React.memo` | automatic via struct equality |

## Why no SwiftData at T0

`@Model` types must be `final class` — OOP by construction — and drag in
`ModelContainer`/`ModelContext` plus implicit-identity semantics that clash
with pure-value thinking. Persist value state via free functions
(`loadAppState() async -> AppState`, `saveAppState(_:) async`, atomic
writes); swap the storage behind the same signatures later. Views and
reducers never learn about storage.

## Forbidden constructs

`class` / `final class` / `open class`; `@Observable class`;
`ObservableObject` / `@StateObject` / `@ObservedObject`;
`@EnvironmentObject` (the class-based variant — `@Environment` is fine);
`@Model` / SwiftData; NotificationCenter singletons; `static let shared`
service instances.

Protocols are fine as **capability markers on structs** (`Identifiable`,
`Equatable`, `Sendable`, `Codable`). Don't build protocol inheritance trees
to simulate OOP.

## Mechanical verification

Zero-output guards, e.g. `rg '\bclass '` / `ObservableObject|@StateObject|…`
/ `@Model|SwiftData` over the app sources. Any printed line → stop and
refactor; these are guardrails, not style nags.

## Verify on the simulator, never previews alone

`#Preview` renders a view in isolation — no app root, no tab chrome, no real
safe-area insets, no sheet presentation, no runtime appearance switching. A
passing preview means it compiles and lays out. Before reporting visual work
done: build, boot the simulator, walk the real user flow (both light and dark
when appearance is touched). If the sim isn't available, say so explicitly.
