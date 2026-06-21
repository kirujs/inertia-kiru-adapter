import { config as coreConfig } from '@inertiajs/core'

export type KiruInertiaAppConfig = {
  strictMode?: boolean
}

export const config = coreConfig.extend<KiruInertiaAppConfig>()
