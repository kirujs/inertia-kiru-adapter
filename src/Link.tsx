import {
  ActiveVisit,
  isUrlMethodPair,
  LinkComponentBaseProps,
  LinkPrefetchOption,
  mergeDataIntoQueryString,
  Method,
  PendingVisit,
  resolveUrlMethodPairComponent,
  router,
  shouldIntercept,
  shouldNavigate,
  VisitOptions,
  UrlMethodPair
} from '@inertiajs/core'
import { computed, createElement, ElementProps, onMount, ref, setup, signal } from 'kiru'
import { config } from './config'
import { noop } from './utils'

interface BaseInertiaLinkProps extends LinkComponentBaseProps {
  as?: string | Kiru.FC<any>
  onClick?: (event: Kiru.MouseEvent) => void
  ref?: Kiru.Ref<unknown>
}

export type InertiaLinkProps = BaseInertiaLinkProps &
  Omit<ElementProps<'a'>, keyof BaseInertiaLinkProps>

export const Link: Kiru.FC<InertiaLinkProps> = () => {
  const $ = setup<InertiaLinkProps>()

  const inFlightCount = signal(0)
  const hoverTimeout = ref<number | undefined>(undefined)

  const _method = computed(() =>
    isUrlMethodPair($.props.href ?? '') ? ($.props.href as UrlMethodPair).method : (($.props.method ?? 'get').toLowerCase() as Method),
  )

  const resolvedComponent = computed(() => {
    if ($.props.component) return $.props.component
    if ($.props.instant && isUrlMethodPair($.props.href ?? '')) return resolveUrlMethodPairComponent($.props.href as UrlMethodPair)
    return null
  })

  const _as = computed(() => {
    const as = $.props.as ?? 'a'
    if (typeof as !== 'string' || as.toLowerCase() !== 'a') return as
    return _method.value !== 'get' ? 'button' : as.toLowerCase()
  })

  const mergeDataArray = computed(() =>
    mergeDataIntoQueryString(
      _method.value,
      isUrlMethodPair($.props.href ?? '') ? ($.props.href as UrlMethodPair).url : ($.props.href as string ?? ''),
      $.props.data ?? {},
      $.props.queryStringArrayFormat ?? 'brackets',
    ),
  )

  const url = computed(() => mergeDataArray.value[0])
  const _data = computed(() => mergeDataArray.value[1])

  const baseParams = computed<VisitOptions>(() => ({
    data: _data.value,
    method: _method.value,
    preserveScroll: $.props.preserveScroll ?? false,
    preserveState: $.props.preserveState ?? _method.value !== 'get',
    preserveUrl: $.props.preserveUrl ?? false,
    replace: $.props.replace ?? false,
    only: $.props.only ?? [],
    except: $.props.except ?? [],
    headers: $.props.headers ?? {},
    async: $.props.async ?? false,
    component: resolvedComponent.value,
    pageProps: $.props.pageProps ?? null,
  }))

  const visitParams = computed<VisitOptions>(() => ({
    ...baseParams.value,
    viewTransition: $.props.viewTransition ?? false,
    onCancelToken: $.props.onCancelToken ?? noop,
    onBefore: $.props.onBefore ?? noop,
    onStart(visit: PendingVisit) {
      inFlightCount.value += 1
      ;($.props.onStart ?? noop)(visit)
    },
    onProgress: $.props.onProgress ?? noop,
    onFinish(visit: ActiveVisit) {
      inFlightCount.value -= 1
      ;($.props.onFinish ?? noop)(visit)
    },
    onCancel: $.props.onCancel ?? noop,
    onSuccess: $.props.onSuccess ?? noop,
    onError: $.props.onError ?? noop,
  }))

  const prefetchModes = computed<LinkPrefetchOption[]>(() => {
    const prefetch = $.props.prefetch ?? false
    if (prefetch === true) return ['hover']
    if (prefetch === false) return []
    if (Array.isArray(prefetch)) return prefetch
    return [prefetch]
  })

  const cacheForValue = computed(() => {
    const cacheFor = $.props.cacheFor ?? 0
    if (cacheFor !== 0) return cacheFor
    if (prefetchModes.value.length === 1 && prefetchModes.value[0] === 'click') return 0
    return config.get('prefetch.cacheFor')
  })

  const doPrefetch = () => {
    router.prefetch(
      url.value,
      {
        ...baseParams.value,
        onPrefetching: $.props.onPrefetching ?? noop,
        onPrefetched: $.props.onPrefetched ?? noop,
      },
      { cacheFor: cacheForValue.value, cacheTags: $.props.cacheTags ?? [] },
    )
  }

  onMount(() => {
    if (prefetchModes.value.includes('mount')) {
      setTimeout(() => doPrefetch())
    }
    return () => clearTimeout(hoverTimeout.current)
  })

  return () => {
    const modes = prefetchModes.value
    const currentUrl = url.value
    const currentVisitParams = visitParams.value
    const onClick = $.props.onClick ?? noop

    const regularEvents = {
      onclick: (event: Kiru.MouseEvent) => {
        onClick(event)
        if (shouldIntercept(event as unknown as MouseEvent)) {
          event.preventDefault()
          router.visit(currentUrl, currentVisitParams)
        }
      },
    }

    const prefetchHoverEvents = {
      onmouseenter: () => {
        hoverTimeout.current = window.setTimeout(() => doPrefetch(), config.get('prefetch.hoverDelay'))
      },
      onmouseleave: () => {
        clearTimeout(hoverTimeout.current)
      },
      onclick: regularEvents.onclick,
    }

    const prefetchClickEvents = {
      onmousedown: (event: Kiru.MouseEvent) => {
        if (shouldIntercept(event as unknown as MouseEvent)) {
          event.preventDefault()
          doPrefetch()
        }
      },
      onkeydown: (event: Kiru.KeyboardEvent) => {
        if (shouldNavigate(event as unknown as KeyboardEvent)) {
          event.preventDefault()
          doPrefetch()
        }
      },
      onmouseup: (event: Kiru.MouseEvent) => {
        if (shouldIntercept(event as unknown as MouseEvent)) {
          event.preventDefault()
          router.visit(currentUrl, currentVisitParams)
        }
      },
      onkeyup: (event: Kiru.KeyboardEvent) => {
        if (shouldNavigate(event as unknown as KeyboardEvent)) {
          event.preventDefault()
          router.visit(currentUrl, currentVisitParams)
        }
      },
      onclick: (event: Kiru.MouseEvent) => {
        onClick(event)
        if (shouldIntercept(event as unknown as MouseEvent)) {
          event.preventDefault()
        }
      },
    }

    const currentAs = _as.value

    const elProps =
      currentAs === 'button'
        ? { type: 'button' }
        : currentAs === 'a' || typeof currentAs !== 'string'
          ? { href: currentUrl }
          : {}

    const events = modes.includes('hover')
      ? prefetchHoverEvents
      : modes.includes('click')
        ? prefetchClickEvents
        : regularEvents

    return createElement(
      currentAs as string,
      {
        ...elProps,
        ref: $.props.ref,
        ...events,
        'data-loading': inFlightCount.value > 0 ? '' : undefined,
      },
      $.props.children,
    )
  }
}

Link.displayName = 'InertiaLink'
