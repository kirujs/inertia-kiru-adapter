import { ReloadOptions, router } from '@inertiajs/core'
import { createElement, signal, ref, onMount, setup, effect } from 'kiru'

type WhenVisibleProps = {
  children: JSX.Children
  fallback: JSX.Children
  data?: string | string[]
  params?: ReloadOptions
  buffer?: number
  as?: string
  always?: boolean
}

export const WhenVisible: Kiru.FC<WhenVisibleProps> = () => {
  const $ = setup<WhenVisibleProps>()
  const buffer = $.derive(p => p.buffer)

  const loaded = signal(false)
  const hasFetched = ref(false)
  const fetching = ref(false)
  const elRef = ref<HTMLDivElement>(null)

  const getReloadParams = (): Partial<ReloadOptions> => {
    if ($.props.data) {
      return {
        only: (Array.isArray($.props.data) ? $.props.data : [$.props.data]) as string[],
      }
    }

    if (!$.props.params) {
      throw new Error('You must provide either a `data` or `params` prop.')
    }

    return $.props.params
  }

  onMount(() => {
    const handle = effect(() => {
      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries[0].isIntersecting) {
            return
          }

          if (!$.props.always && hasFetched.current) {
            observer.disconnect()
          }

          if (fetching.current) {
            return
          }

          hasFetched.current = true
          fetching.current = true

          const reloadParams = getReloadParams()

          router.reload({
            ...reloadParams,
            onStart: (e) => {
              fetching.current = true
              reloadParams.onStart?.(e)
            },
            onFinish: (e) => {
              loaded.value = true
              fetching.current = false
              reloadParams.onFinish?.(e)

              if (!$.props.always) {
                observer.disconnect()
              }
            },
          })
        },
        {
          rootMargin: `${buffer.value || 0}px`,
        },
      )

      observer.observe(elRef.current!)

      return () => observer.disconnect()
    })

    return () => handle.stop()
  })

  return () => {
    if ($.props.always || !loaded.value) {
      return createElement($.props.as ?? 'div', { ref: elRef }, loaded.value ? $.props.children : $.props.fallback)
    }

    return loaded.value ? $.props.children : null
  }
}

WhenVisible.displayName = 'InertiaWhenVisible'
