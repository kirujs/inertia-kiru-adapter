import { router, VisitOptions } from '@inertiajs/core'
import { signal, onMount, Signal } from 'kiru'

type PrefetchResult = {
  lastUpdatedAt: Signal<number | null>
  isPrefetching: Signal<boolean>
  isPrefetched: Signal<boolean>
  flush: () => void
}

export const usePrefetch = (options: VisitOptions = {}): PrefetchResult  => {
  const cached = typeof window === 'undefined' ? null : router.getCached(window.location.pathname, options)
  const inFlight = typeof window === 'undefined' ? null : router.getPrefetching(window.location.pathname, options)

  const lastUpdatedAt = signal<number | null>(cached?.staleTimestamp || null)
  const isPrefetching = signal(inFlight !== null)
  const isPrefetched = signal(cached !== null)

  onMount(() => {
    const onPrefetchingListener = router.on('prefetching', (e) => {
      if (e.detail.visit.url.pathname === window.location.pathname) {
        isPrefetching.value = true
      }
    })

    const onPrefetchedListener = router.on('prefetched', (e) => {
      if (e.detail.visit.url.pathname === window.location.pathname) {
        isPrefetching.value = false
        isPrefetched.value = true
        lastUpdatedAt.value = e.detail.fetchedAt
      }
    })

    return () => {
      onPrefetchedListener()
      onPrefetchingListener()
    }
  })

  return {
    lastUpdatedAt,
    isPrefetching,
    isPrefetched,
    flush: () => router.flush(window.location.pathname, options),
  }
}
