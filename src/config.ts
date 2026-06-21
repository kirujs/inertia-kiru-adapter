import { config as coreConfig } from '@inertiajs/core'

type KiruInertiaAppConfig = {
  strictMode?: boolean
}

export const config = coreConfig.extend<KiruInertiaAppConfig>()
