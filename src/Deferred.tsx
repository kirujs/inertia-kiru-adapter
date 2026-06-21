import { effect, signal, setup } from "kiru"
import { usePage } from "./context"

type DefferedProps = {
  children: JSX.Children
  fallback: JSX.Children,
  data: string | string[]
}

type DeferredComp = Kiru.FC<DefferedProps>

export const Deferred: DeferredComp = () => {
  const $ = setup<DefferedProps>()

  if (!$.props.data) {
    throw new Error('`<Deferred>` requires a `data` prop')
  }

  const loaded = signal(false)
  const page = usePage()
  const keys = $.derive(props => Array.isArray(props.data) ? props.data : [props.data])

  effect(() => {
    const pageProps = page.value?.props ?? {} as Record<string, unknown>
    loaded.value = keys.value.every((key) => pageProps[key] !== undefined)
  })

  return () => loaded.value ? $.props.children : $.props.fallback
}

Deferred.displayName = 'InertiaDeferred'
