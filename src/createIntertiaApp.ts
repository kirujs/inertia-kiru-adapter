import {
  buildSSRBody,
  CreateInertiaAppOptions,
  CreateInertiaAppOptionsForCSR,
  CreateInertiaAppOptionsForSSR,
  exposeInterceptors,
  getInitialPageFromDOM,
  http as httpModule,
  InertiaAppSSRResponse,
  Page,
  PageProps,
  router,
  setupProgress,
  SharedPageProps,
} from '@inertiajs/core'
import { createElement, mount } from 'kiru'
import { hydrate } from 'kiru/ssr/client'
import { App, InertiaAppProps, type InertiaApp } from './App'
import { config, type KiruInertiaAppConfig } from './config'
import { KiruComponent } from './types'

export type SetupOptions<ElementType, SharedProps extends PageProps> = {
  el: ElementType
  App: InertiaApp
  props: InertiaAppProps<SharedProps>
}

type ComponentResolver = (
  name: string,
  page?: Page<SharedPageProps>,
) => KiruComponent | Promise<KiruComponent> | { default: KiruComponent }

type KiruWithApp<SharedProps extends PageProps> = (
  app: JSX.Element,
  options: { ssr: boolean; page: Page<SharedProps> },
) => JSX.Element

type InertiaAppOptionsForCSR<SharedProps extends PageProps> = CreateInertiaAppOptionsForCSR<
  SharedProps,
  ComponentResolver,
  SetupOptions<HTMLElement, SharedProps>,
  void,
  KiruInertiaAppConfig
> & {
  withApp?: never
}

type InertiaAppOptionsForSSR<SharedProps extends PageProps> = CreateInertiaAppOptionsForSSR<
  SharedProps,
  ComponentResolver,
  SetupOptions<null, SharedProps>,
  JSX.Element,
  KiruInertiaAppConfig
> & {
  render: (element: JSX.Element) => string
  withApp?: never
}

type InertiaAppOptionsAuto<SharedProps extends PageProps> = Omit<
  CreateInertiaAppOptions<
    ComponentResolver,
    SetupOptions<HTMLElement | null, SharedProps>,
    JSX.Element | void,
    KiruInertiaAppConfig
  >,
  'setup'
> & {
  page?: Page<SharedProps>
  render?: undefined
} & (
    | { setup?: undefined; withApp?: KiruWithApp<SharedProps> }
    | { setup: (options: SetupOptions<HTMLElement | null, SharedProps>) => JSX.Element | void; withApp?: never }
  )

type RenderToString = (element: JSX.Element) => string

type RenderFunction<SharedProps extends PageProps> = (
  page: Page<SharedProps>,
  renderToString: RenderToString,
) => Promise<InertiaAppSSRResponse>

export async function createInertiaApp<SharedProps extends PageProps = PageProps & SharedPageProps>(
  options: InertiaAppOptionsForCSR<SharedProps>,
): Promise<void>
export async function createInertiaApp<SharedProps extends PageProps = PageProps & SharedPageProps>(
  options: InertiaAppOptionsForSSR<SharedProps>,
): Promise<InertiaAppSSRResponse>
export async function createInertiaApp<SharedProps extends PageProps = PageProps & SharedPageProps>(
  options?: InertiaAppOptionsAuto<SharedProps>,
): Promise<void | RenderFunction<SharedProps>>
export async function createInertiaApp<SharedProps extends PageProps = PageProps & SharedPageProps>(
  {
    id = 'app',
    resolve,
    setup,
    title,
    progress = {},
    page,
    render,
    defaults = {},
    nonce,
    http,
    layout,
    withApp,
    dev = !!import.meta.env?.DEV,
  }:
    | InertiaAppOptionsForCSR<SharedProps>
    | InertiaAppOptionsForSSR<SharedProps>
    | InertiaAppOptionsAuto<SharedProps> = {} as InertiaAppOptionsAuto<SharedProps>,
): Promise<InertiaAppSSRResponse | RenderFunction<SharedProps> | void> {
  config.replace(defaults)

  if (nonce) {
    config.set('nonce', nonce)
  }

  if (http) {
    httpModule.setClient(http)
  }

  if (dev) {
    exposeInterceptors()
  }

  const isServer = typeof window === 'undefined'

  const resolveComponent = (name: string, page?: Page) =>
    Promise.resolve(resolve!(name, page)).then((module) => {
      return ((module as { default?: KiruComponent }).default || module) as KiruComponent
    })

  // SSR render function factory — when on server without page/render, return a render function.
  // Used by the Vite plugin's SSR transform.
  if (isServer && !page && !render) {
    return async (page: Page<SharedProps>, renderToString: RenderToString) => {
      let head: string[] = []

      const initialComponent = await resolveComponent(page.component, page)

      const props: InertiaAppProps<SharedProps> = {
        initialPage: page,
        initialComponent,
        resolveComponent,
        titleCallback: title,
        onHeadUpdate: (elements: string[]) => (head = elements),
        defaultLayout: layout,
      }

      let app: JSX.Element

      if (setup) {
        app = (setup as (options: SetupOptions<null, SharedProps>) => JSX.Element)({
          el: null,
          App,
          props,
        })
      } else {
        app = createElement(App, props as unknown as Record<string, unknown>)

        if (withApp) {
          app = (withApp as KiruWithApp<SharedProps>)(app, { ssr: true, page })
        }
      }

      const html = renderToString(app)
      const body = buildSSRBody(id, page, html)

      return { head, body }
    }
  }

  const initialPage = page || getInitialPageFromDOM<Page<SharedProps>>(id)!

  let head: string[] = []

  const app = await Promise.all([
    resolveComponent(initialPage.component, initialPage),
    router.decryptHistory().catch(() => {}),
  ]).then(([initialComponent]) => {
    const props: InertiaAppProps<SharedProps> = {
      initialPage,
      initialComponent,
      resolveComponent,
      titleCallback: title,
      onHeadUpdate: isServer ? (elements: string[]) => (head = elements) : undefined,
      defaultLayout: layout,
    }

    if (isServer) {
      return (setup as (options: SetupOptions<null, SharedProps>) => JSX.Element)({
        el: null,
        App,
        props,
      })
    }

    const el = document.getElementById(id)!

    if (setup) {
      return (setup as (options: SetupOptions<HTMLElement, SharedProps>) => void)({
        el,
        App,
        props,
      })
    }

    let appElement: JSX.Element = createElement(App, props as unknown as Record<string, unknown>)

    if (withApp) {
      appElement = (withApp as KiruWithApp<SharedProps>)(appElement, { ssr: false, page: initialPage })
    }

    if (el.hasAttribute('data-server-rendered')) {
      hydrate(appElement, el)
    } else {
      mount(appElement, el)
    }
  })

  if (!isServer && progress) {
    setupProgress(progress)
  }

  if (isServer && render && app) {
    const html = (render as (element: JSX.Element) => string)(app)
    const body = buildSSRBody(id, initialPage, html)

    return { head, body }
  }
}
