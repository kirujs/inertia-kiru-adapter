import { type LayoutCallbackReturn, PageHandler, SharedPageProps } from '@inertiajs/core'

export type LayoutFunction = (page: JSX.Children) => JSX.Element
export type LayoutCallback = (props: SharedPageProps) => LayoutCallbackReturn<Kiru.FC<any>>
export type LayoutComponent = Kiru.FC<{ children: JSX.Children }>

export type KiruComponent = Kiru.FC<any> & {
  layout?: LayoutComponent | LayoutComponent[] | LayoutFunction | ((props: any) => any)
}

export type KiruPageHandlerArgs = Parameters<PageHandler<Kiru.FC<any>>>[0]
