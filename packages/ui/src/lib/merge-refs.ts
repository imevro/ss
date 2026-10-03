/** Ссылка на узел: функция или объект с полем current. */
type Ref<T> = ((node: T | null) => void) | { current: T | null } | null | undefined;

/** Несколько ссылок на один узел: нужна, когда узел нужен и компоненту, и вызову. */
export const mergeRefs =
  <T>(...refs: readonly Ref<T>[]) =>
  (node: T | null): void => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(node);
        continue;
      }
      if (ref !== null && ref !== undefined) ref.current = node;
    }
  };
