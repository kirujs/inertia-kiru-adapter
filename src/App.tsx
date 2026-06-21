import {
  createHeadManager,
  HeadManagerOnUpdateCallback,
  HeadManagerTitleCallback,
  isPropsObject,
  isPropsObjectOrCallback,
  normalizeLayouts,
  Page,
  PageHandler,
  PageProps,
  router,
} from '@inertiajs/core'
import { computed, createElement, flushSync, onMount, setup, signal } from 'kiru'
import { resetLayoutProps, store } from './layoutProps'
import { PageContext, HeadContext } from './context'
import { LayoutFunction, KiruComponent, KiruPageHandlerArgs } from './types'

function isComponent(value: unknown): value is KiruComponent {
  return typeof value === 'function'
}

function isKiruElement(value: unknown): value is Kiru.Element {
  return typeof value === 'object' && value !== null && 'type' in value && 'props' in value
}

function isRenderFunction(value: unknown): boolean {
  if (typeof value !== 'function') return false
  const fn = value as Function
  return fn.length === 1 && typeof fn.prototype === 'undefined'
}

function isLayoutResolver(value: unknown): boolean {
  return (
    typeof value === 'function' &&
    (value as Function).length <= 1 &&
    typeof (value as Function).prototype === 'undefined'
  )
}

let currentIsInitialPage = true
let routerIsInitialized = false
let swapComponent: PageHandler<KiruComponent> = async () => {
  // Dummy function so we can init the router outside of the onMount hook. This is
  // needed so `router.reload()` works right away (on mount) in any of the user's
  // components. We swap in the real function in the onMount hook below.
  currentIsInitialPage = false
}

type CurrentPage = {
  component: KiruComponent | null
  page: Page
  key: number | null
}

export interface InertiaAppProps<SharedProps extends PageProps = PageProps> {
  children?: (options: { Component: KiruComponent; props: PageProps; key: number | null }) => JSX.Element
  initialPage: Page<SharedProps>
  initialComponent?: KiruComponent
  resolveComponent?: (name: string, page?: Page) => KiruComponent | Promise<KiruComponent>
  titleCallback?: HeadManagerTitleCallback
  onHeadUpdate?: HeadManagerOnUpdateCallback
  defaultLayout?: (name: string, page: Page) => unknown
}

export type InertiaApp = Kiru.FC<InertiaAppProps>

const emptySnapshot = {
  shared: {} as Record<string, unknown>,
  named: {} as Record<string, Record<string, unknown>>,
}

export const App: Kiru.FC<InertiaAppProps> = () => {
  const $ = setup<InertiaAppProps>()

  const current = signal<CurrentPage>({
    component: $.props.initialComponent || null,
    page: { ...$.props.initialPage, flash: $.props.initialPage.flash ?? {} },
    key: null,
  })

  const pageSignal = computed(() => current.value.page as Page | null)

  const headManager = createHeadManager(
    typeof window === 'undefined',
    $.props.titleCallback || ((title) => title),
    $.props.onHeadUpdate || (() => {}),
  )

  const dynamicLayoutProps = signal(store.get() ?? emptySnapshot)

  if (!routerIsInitialized) {
    router.init<KiruComponent>({
      initialPage: $.props.initialPage,
      resolveComponent: $.props.resolveComponent!,
      swapComponent: async (args) => swapComponent(args),
      onFlash: (flash) => {
        current.value = { ...current.value, page: { ...current.value.page, flash } }
      },
    })

    routerIsInitialized = true
  }

  onMount(() => {
    const unsubscribe = store.subscribe(() => {
      dynamicLayoutProps.value = store.get() ?? emptySnapshot
    })

    swapComponent = async ({ component, page, preserveState }: KiruPageHandlerArgs) => {
      if (currentIsInitialPage) {
        currentIsInitialPage = false
        return
      }

      if (!preserveState) {
        resetLayoutProps()
      }

      current.value = {
        component,
        page,
        key: preserveState ? current.value.key : Date.now(),
      }
      flushSync()
    }

    router.on('navigate', () => headManager.forceUpdate())

    return unsubscribe
  })

  return () => {
    const cur = current.value

    if (!cur.component) {
      return (
        <HeadContext value={headManager}>
          <PageContext value={pageSignal} />
        </HeadContext>
      )
    }

    const children = $.props.children
    const renderChildren =
      children ||
      (({ Component, props, key }: { Component: KiruComponent; props: PageProps; key: number | null }) => {
        const child = createElement(Component, { key, ...props })

        let effectiveLayout: unknown
        let callbackProps: Record<string, unknown> | null = null
        const layoutValue = Component.layout

        if (isLayoutResolver(layoutValue)) {
          const result = (layoutValue as Function)(props)

          if (isKiruElement(result)) {
            return (layoutValue as LayoutFunction)(child)
          }

          if (isPropsObjectOrCallback(result, isComponent)) {
            effectiveLayout = $.props.defaultLayout?.(cur.page.component, cur.page)
            callbackProps = result as Record<string, unknown>
          } else {
            effectiveLayout = result
          }
        } else if (isPropsObject(layoutValue, isComponent)) {
          effectiveLayout = $.props.defaultLayout?.(cur.page.component, cur.page)
          callbackProps = layoutValue as unknown as Record<string, unknown>
        } else {
          effectiveLayout = layoutValue ?? $.props.defaultLayout?.(cur.page.component, cur.page)
        }

        let layouts = normalizeLayouts(
          effectiveLayout,
          isComponent,
          layoutValue && !callbackProps ? isRenderFunction : undefined,
        )

        if (callbackProps) {
          layouts = layouts.map((layout) => ({ ...layout, props: { ...layout.props, ...callbackProps } }))
        }

        if (layouts.length > 0) {
          return layouts.reduceRight((childNode, layout) => {
            return createElement(
              layout.component,
              {
                ...props,
                ...layout.props,
                ...dynamicLayoutProps.value.shared,
                ...(layout.name ? dynamicLayoutProps.value.named[layout.name] || {} : {}),
              },
              childNode,
            )
          }, child)
        }

        return child
      })

    return (
      <HeadContext value={headManager}>
        <PageContext value={pageSignal}>
          {renderChildren({
            Component: cur.component!,
            key: cur.key,
            props: cur.page.props,
          })}
        </PageContext>
      </HeadContext>
    )
  }
}

App.displayName = 'InertiaApp'
