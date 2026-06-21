import { router } from '@inertiajs/core'
import { signal, effect, Signal } from 'kiru'

export const useRemember = <State,>(
  initialState: State,
  key?: string,
  excludeKeysRef?: Kiru.RefObject<string[]>,
): Signal<State> => {
  const restored = router.restore(key) as State
  const state = signal<State>(restored !== undefined ? restored : initialState)

  effect(() => {
    const keys = excludeKeysRef?.current
    if (keys && keys.length > 0 && typeof state.value === 'object' && state.value !== null) {
      const filtered = { ...state.value } as Record<string, unknown>
      keys.forEach((k) => delete filtered[k])
      router.remember(filtered, key)
    } else {
      router.remember(state.value, key)
    }
  })

  return state
}
