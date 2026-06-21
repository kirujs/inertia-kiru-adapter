import { PollOptions, ReloadOptions, router } from '@inertiajs/core'
import { onMount, ref } from 'kiru'

export const usePoll = (
  interval: number,
  requestOptions: ReloadOptions = {},
  options: PollOptions = {
    keepAlive: false,
    autoStart: true,
  }
) => {
  const pollRef = ref(
    router.poll(interval, requestOptions, {
      ...options,
      autoStart: false,
    }),
  )

  onMount(() => {
    if (options.autoStart ?? true) {
      pollRef.current.start()
    }

    return () => pollRef.current.stop()
  })

  return {
    stop: pollRef.current.stop,
    start: pollRef.current.start,
  }
}
