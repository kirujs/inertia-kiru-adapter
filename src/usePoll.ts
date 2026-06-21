import { PollOptions, ReloadOptions, router } from '@inertiajs/core'
import { onMount, ref } from 'kiru'

export const usePoll = (
  interval: number,
  requestOptions: ReloadOptions | (() => ReloadOptions) = {},
  options: PollOptions = {
    keepAlive: false,
    autoStart: true,
  },
) => {
  const latest = ref(requestOptions)
  latest.current = requestOptions

  const pollRef = ref<ReturnType<typeof router.poll> | null>(null)

  onMount(() => {
    pollRef.current = router.poll(
      interval,
      typeof requestOptions === 'function' ? () => (latest.current as () => ReloadOptions)() : requestOptions,
      { ...options, autoStart: options.autoStart ?? true },
    )

    return () => pollRef.current?.destroy()
  })

  return {
    stop: () => pollRef.current?.stop(),
    start: () => pollRef.current?.start(),
  }
}
