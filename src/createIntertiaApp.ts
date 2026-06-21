import { Page, PageProps, PageResolver, setupProgress } from "@inertiajs/core"
import { createElement, renderToString } from 'kiru'
import { App } from "./App"
import { encodeHtmlEntities } from "./utils"

type Key = any

type AppType<SharedProps extends PageProps = PageProps> = Kaioken.FC<
  {
    layout?: any
    children?: (props: {
      Component: Kaioken.FC<any>
      key: Key
      props: Page<SharedProps>["props"]
    }) => Kaioken.FC<any>
  } & SetupOptions<unknown, SharedProps>["props"]
>

export type SetupOptions<ElementType, SharedProps extends PageProps> = {
  el: ElementType | null
  App: AppType
  props: {
    initialPage: Page<SharedProps>
    initialComponent: Kaioken.FC<any>,
    resolveComponent: PageResolver,
    titleCallBack?: (title: string) => string,
    onHeadUpdate?: (elements: string[]) => void,
  }
}

type BaseInertiaAppOptions = {
  title?: (title: string) => string,
  resolve: PageResolver
}

type CreateInertiaAppSetupReturnType = string | JSX.Element | { head?: string[], body?: string } | void
type InertiaAppOptionsForCSR<SharedProps extends PageProps> =
  BaseInertiaAppOptions & {
    id?: string
    page?: Page | string
    render?: undefined
    progress?:
      | false
      | {
          delay?: number
          color?: string
          includeCSS?: boolean
          showSpinner?: boolean
        }
    setup(
      options: SetupOptions<HTMLElement, SharedProps>
    ): CreateInertiaAppSetupReturnType
  }

export default async function createInertiaApp<
  SharedProps extends PageProps = PageProps
>({
  id = "app",
  resolve,
  setup,
  progress = {},
  page,
  title = undefined,
}: InertiaAppOptionsForCSR<SharedProps>): Promise<CreateInertiaAppSetupReturnType> {
  const isServer = !globalThis.document
  const el = !isServer ? document?.getElementById?.(id) : null
  const initialPage = page || JSON.parse(el?.dataset?.page ?? "{}") || {}
  let head: string[] = []

  const resolveComponent = (name: string) =>
    Promise.resolve(resolve(name)).then(
      (module: any) => module.default || module
    )

  const kaiokenApp = await resolveComponent(initialPage.component).then((initialComponent) => {
    return setup({
      el,
      App,
      props: {
        initialPage,
        initialComponent,
        resolveComponent,
        titleCallBack: title,
        onHeadUpdate: isServer ? (elements) => {
          head = elements
        } : undefined,
      },
    })
  })

  if (!isServer && progress) {
    setupProgress(progress)
  }

  if (isServer) {
    const body = renderToString(
      () => createElement(
        'div', 
        {
          id: 'app',
          'data-page': encodeHtmlEntities(JSON.stringify(initialPage)),
        }, 
        [kaiokenApp]
      )
    )

    return {
      body,
      head,
    }
  }
}
