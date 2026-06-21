import { createHeadManager, Page, PageResolver, router } from "@inertiajs/core"
import { HeadContext, PageContext } from "./context"
import { onMount, signal, computed, createElement } from 'kiru'

type AppProps = {
  initialPage: Page,
  resolveComponent: PageResolver,
  initialComponent: Kiru.FC,
  titleCallBack?: (title: string) => string,
  onHeadUpdate?: (elements: string[]) => void,
}

export const App: Kiru.FC<AppProps> = (props) => {
  const inertiaCtx = signal({
    component: props.initialComponent as unknown,
    page: props.initialPage as Page,
    key: undefined as number | undefined,
  })

  const headManager = createHeadManager(
    typeof window === 'undefined',
    props.titleCallBack || ((title: string) => title),
      props.onHeadUpdate || (() => {})
  )

  onMount(() => {
    router.init({
      initialPage: props.initialPage,
      resolveComponent: props.resolveComponent,
      swapComponent: async ({ component, page, preserveState }) => {
        inertiaCtx.value = {
          component,
          page,
          key: preserveState ? inertiaCtx.value.key : Date.now(),
        }
      }
    })

    router.on('navigate', () => headManager.forceUpdate())
  })

  const renderChildren = computed(() => {
    // @ts-expect-error layout
    const layout = inertiaCtx.value?.component?.layout
    if (inertiaCtx.value.component) {
      const child = createElement(inertiaCtx.value.component as Kiru.FC, {
        key: inertiaCtx.value.key,
        ...inertiaCtx.value.page.props
      })

      // @ts-expect-error .layout is not defined on unknown
      if (typeof inertiaCtx.value.component.layout === 'function') {
        // @ts-expect-error .layout is not defined on unknown
        return createElement(inertiaCtx.value.component.layout, {
          children: child,
        })
      }

      return child
    }

    return undefined
  })

  return () => (
    <PageContext value={inertiaCtx.value.page}>
      <HeadContext value={headManager}>
        {renderChildren.value}
      </HeadContext>
    </PageContext>
  )
}

App.displayName = 'InertiaApp'
