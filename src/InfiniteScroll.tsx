import {
  getScrollableParent,
  InfiniteScrollActionSlotProps,
  InfiniteScrollComponentBaseProps,
  InfiniteScrollRef,
  InfiniteScrollSlotProps,
  ReloadOptions,
  useInfiniteScroll,
  UseInfiniteScrollProps,
} from '@inertiajs/core'
import { computed, createElement, effect, ElementProps, Fragment, onMount, setup, signal, untrack } from 'kiru'
import { usePage } from './context'

const INTERNAL_PROP_KEYS = new Set([
  'data', 'buffer', 'as', 'manual', 'manualAfter', 'preserveUrl', 'reverse',
  'autoScroll', 'children', 'startElement', 'endElement', 'itemsElement',
  'previous', 'next', 'loading', 'params', 'onlyNext', 'onlyPrevious', 'ref',
])

const resolveHTMLElement = (
  value: string | Kiru.RefObject<HTMLElement | null> | null,
  fallback: HTMLElement | null,
): HTMLElement | null => {
  if (!value) return fallback
  if (typeof value === 'object' && 'current' in value) return value.current
  if (typeof value === 'string') return document.querySelector(value) as HTMLElement | null
  return fallback
}

const renderSlot = (
  slotContent: JSX.Children | ((props: InfiniteScrollActionSlotProps) => JSX.Element) | undefined,
  slotProps: InfiniteScrollActionSlotProps,
  fallback: JSX.Element | null = null,
): JSX.Element | null => {
  if (!slotContent) return fallback
  return typeof slotContent === 'function' ? slotContent(slotProps) : (slotContent as JSX.Element)
}

interface ComponentProps
  extends
    InfiniteScrollComponentBaseProps,
    Omit<ElementProps<'div'>, keyof InfiniteScrollComponentBaseProps | 'children' | 'ref'> {
  ref?: Kiru.Ref<InfiniteScrollRef>
  children?: JSX.Children | ((props: InfiniteScrollSlotProps) => JSX.Element)

  startElement?: string | Kiru.RefObject<HTMLElement | null>
  endElement?: string | Kiru.RefObject<HTMLElement | null>
  itemsElement?: string | Kiru.RefObject<HTMLElement | null>

  previous?: JSX.Children | ((props: InfiniteScrollActionSlotProps) => JSX.Element)
  next?: JSX.Children | ((props: InfiniteScrollActionSlotProps) => JSX.Element)
  loading?: JSX.Children | ((props: InfiniteScrollActionSlotProps) => JSX.Element)

  params?: ReloadOptions
  onlyNext?: boolean
  onlyPrevious?: boolean
}

export const InfiniteScroll: Kiru.FC<ComponentProps> = () => {
  const $ = setup<ComponentProps>()

  const page = usePage()
  const scrollProp = page.value?.scrollProps?.[$.props.data]

  // Callback ref signals — updated when DOM nodes mount/unmount
  const startElementFromRef = signal<HTMLElement | null>(null)
  const endElementFromRef = signal<HTMLElement | null>(null)
  const itemsElementFromRef = signal<HTMLElement | null>(null)

  const startElementRef = (node: HTMLElement | null) => { startElementFromRef.value = node }
  const endElementRef = (node: HTMLElement | null) => { endElementFromRef.value = node }
  const itemsElementRef = (node: HTMLElement | null) => { itemsElementFromRef.value = node }

  const loadingPrevious = signal(false)
  const loadingNext = signal(false)
  const requestCount = signal(0)
  const hasPreviousPage = signal(!!scrollProp?.previousPage)
  const hasNextPage = signal(!!scrollProp?.nextPage)

  const resolvedStartElement = signal<HTMLElement | null>(null)
  const resolvedEndElement = signal<HTMLElement | null>(null)
  const resolvedItemsElement = signal<HTMLElement | null>(null)

  const infiniteScrollState = signal<UseInfiniteScrollProps | null>(null)

  const scrollableParent = computed(() => getScrollableParent(resolvedItemsElement.value))
  const dataManager = computed(() => infiniteScrollState.value?.dataManager)
  const elementManager = computed(() => infiniteScrollState.value?.elementManager)

  const manualMode = computed(() =>
    ($.props.manual ?? false) || (($.props.manualAfter ?? 0) > 0 && requestCount.value >= ($.props.manualAfter ?? 0)),
  )
  const autoLoad = computed(() => !manualMode.value)

  const scrollToBottom = () => {
    const parent = scrollableParent.value
    if (parent) {
      parent.scrollTo({ top: parent.scrollHeight, behavior: 'instant' })
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' })
    }
  }

  onMount(() => {
    // Resolve element refs/selectors reactively
    const h1 = effect(() => {
      resolvedStartElement.value = $.props.startElement
        ? resolveHTMLElement($.props.startElement as string | Kiru.RefObject<HTMLElement | null>, startElementFromRef.value)
        : startElementFromRef.value
    })

    const h2 = effect(() => {
      resolvedEndElement.value = $.props.endElement
        ? resolveHTMLElement($.props.endElement as string | Kiru.RefObject<HTMLElement | null>, endElementFromRef.value)
        : endElementFromRef.value
    })

    const h3 = effect(() => {
      resolvedItemsElement.value = $.props.itemsElement
        ? resolveHTMLElement($.props.itemsElement as string | Kiru.RefObject<HTMLElement | null>, itemsElementFromRef.value)
        : itemsElementFromRef.value
    })

    // Main setup — recreates when structural elements change
    const h4 = effect(() => {
      const itemsEl = resolvedItemsElement.value
      const startEl = resolvedStartElement.value
      const endEl = resolvedEndElement.value
      const scrollParent = scrollableParent.value

      if (!itemsEl) return

      function syncState() {
        requestCount.value = infiniteScrollInstance.dataManager.getRequestCount()
        hasPreviousPage.value = infiniteScrollInstance.dataManager.hasPrevious()
        hasNextPage.value = infiniteScrollInstance.dataManager.hasNext()
      }

      const infiniteScrollInstance = useInfiniteScroll({
        getPropName: () => $.props.data,
        inReverseMode: () => $.props.reverse ?? false,
        shouldFetchNext: () => !($.props.onlyPrevious ?? false),
        shouldFetchPrevious: () => !($.props.onlyNext ?? false),
        shouldPreserveUrl: () => $.props.preserveUrl ?? false,
        getReloadOptions: () => ($.props.params ?? {}) as ReloadOptions,

        getTriggerMargin: () => $.props.buffer ?? 0,
        getStartElement: () => startEl!,
        getEndElement: () => endEl!,
        getItemsElement: () => itemsEl,
        getScrollableParent: () => scrollParent,

        onBeforePreviousRequest: () => { loadingPrevious.value = true },
        onBeforeNextRequest: () => { loadingNext.value = true },
        onCompletePreviousRequest: ({ completed }) => {
          loadingPrevious.value = false
          if (completed) syncState()
        },
        onCompleteNextRequest: ({ completed }) => {
          loadingNext.value = false
          if (completed) syncState()
        },
        onDataReset: syncState,
      })

      infiniteScrollState.value = infiniteScrollInstance
      syncState()

      infiniteScrollInstance.elementManager.setupObservers()
      infiniteScrollInstance.elementManager.processServerLoadedElements(
        infiniteScrollInstance.dataManager.getLastLoadedPage(),
      )

      // Read autoLoad without tracking it — the h5 effect handles reactive enable/disable
      if (untrack(() => autoLoad.value)) {
        infiniteScrollInstance.elementManager.enableTriggers()
      }

      return () => {
        infiniteScrollInstance.flush()
        infiniteScrollState.value = null
      }
    })

    // Reactively enable/disable triggers when autoLoad or related props change
    const h5 = effect(() => {
      const em = elementManager.value
      const al = autoLoad.value
      void $.props.onlyNext
      void $.props.onlyPrevious
      void resolvedStartElement.value
      void resolvedEndElement.value
      if (em) {
        al ? em.enableTriggers() : em.disableTriggers()
      }
    })

    // Auto-scroll when scrollable parent changes
    const h6 = effect(() => {
      void scrollableParent.value
      const shouldAutoScroll = $.props.autoScroll !== undefined ? $.props.autoScroll : ($.props.reverse ?? false)
      if (shouldAutoScroll) scrollToBottom()
    })

    // Imperative ref handle — update when dataManager changes
    const h7 = effect(() => {
      const kiruRef = $.props.ref
      if (!kiruRef) return
      const handle: InfiniteScrollRef = {
        fetchNext: dataManager.value?.fetchNext ?? (() => {}),
        fetchPrevious: dataManager.value?.fetchPrevious ?? (() => {}),
        hasPrevious: dataManager.value?.hasPrevious ?? (() => false),
        hasNext: dataManager.value?.hasNext ?? (() => false),
      }
      if (typeof kiruRef === 'function') {
        kiruRef(handle)
      } else {
        kiruRef.current = handle
      }
    })

    return () => {
      h1.stop(); h2.stop(); h3.stop(); h4.stop()
      h5.stop(); h6.stop(); h7.stop()
    }
  })

  return () => {
    const reverse = $.props.reverse ?? false
    const onlyNext = $.props.onlyNext ?? false
    const onlyPrevious = $.props.onlyPrevious ?? false
    const as = $.props.as ?? 'div'
    const al = autoLoad.value
    const lp = loadingPrevious.value
    const ln = loadingNext.value
    const hasPrev = hasPreviousPage.value
    const hasNext = hasNextPage.value

    const headerAutoMode = al && !onlyNext
    const footerAutoMode = al && !onlyPrevious

    const sharedExposed: Pick<
      InfiniteScrollActionSlotProps,
      'loadingPrevious' | 'loadingNext' | 'hasPrevious' | 'hasNext'
    > = { loadingPrevious: lp, loadingNext: ln, hasPrevious: hasPrev, hasNext }

    const exposedPrevious: InfiniteScrollActionSlotProps = {
      loading: lp,
      fetch: dataManager.value?.fetchPrevious ?? (() => {}),
      autoMode: headerAutoMode,
      manualMode: !headerAutoMode,
      hasMore: hasPrev,
      ...sharedExposed,
    }

    const exposedNext: InfiniteScrollActionSlotProps = {
      loading: ln,
      fetch: dataManager.value?.fetchNext ?? (() => {}),
      autoMode: footerAutoMode,
      manualMode: !footerAutoMode,
      hasMore: hasNext,
      ...sharedExposed,
    }

    const exposedSlot: InfiniteScrollSlotProps = {
      loading: lp || ln,
      loadingPrevious: lp,
      loadingNext: ln,
    }

    // Strip internal props before spreading onto the container element
    const allProps = { ...($.props as any) } as Record<string, unknown>
    const restProps: Record<string, unknown> = {}
    for (const key of Object.keys(allProps)) {
      if (!INTERNAL_PROP_KEYS.has(key)) restProps[key] = allProps[key]
    }

    const renderElements: JSX.Element[] = []

    if (!$.props.startElement) {
      renderElements.push(
        createElement(
          'div',
          { ref: startElementRef },
          renderSlot($.props.previous, exposedPrevious, lp ? renderSlot($.props.loading, exposedPrevious) : null),
        ),
      )
    }

    renderElements.push(
      createElement(
        as as string,
        { ...restProps, ref: itemsElementRef },
        typeof $.props.children === 'function'
          ? ($.props.children as (props: InfiniteScrollSlotProps) => JSX.Element)(exposedSlot)
          : $.props.children,
      ),
    )

    if (!$.props.endElement) {
      renderElements.push(
        createElement(
          'div',
          { ref: endElementRef },
          renderSlot($.props.next, exposedNext, ln ? renderSlot($.props.loading, exposedNext) : null),
        ),
      )
    }

    return createElement(Fragment, null, ...(reverse ? [...renderElements].reverse() : renderElements))
  }
}

InfiniteScroll.displayName = 'InertiaInfiniteScroll'
