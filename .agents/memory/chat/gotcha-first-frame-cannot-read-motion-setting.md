# The first frame does not read the motion setting, an effect does

The "reduce motion" setting (`prefers-reduced-motion`) cannot be asked in the render body:
`matchMedia` does not exist on the server, and the first frame would differ from the one the
server sent — the markup would diverge on hydration.

Rule: the state starts **off**, and the setting is read by an effect — then the first frame is
the same on the server and in the browser, and that frame is the one with motion.

How the answer typing does it (`apps/web/app/components/chat.tsx`, `TypedMarkdown`):

- `const still = useReducedMotion()` — the hook tells about the setting, but it must not be
  used as first-frame render state;
- `const [instant, setInstant] = useState(false)` — the first frame always types;
- `useEffect(() => { setInstant(still === true); }, [still])` — the setting arrives after the
  first frame, and typing switches to "the whole text at once".
