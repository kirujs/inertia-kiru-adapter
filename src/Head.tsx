import { renderToString } from "kiru"
import { useHead } from "./context"
import { onMount } from "kiru"

type HeadProps = {
  title?: string
  children?: JSX.Children
}
export const Head: Kiru.FC<HeadProps> = (props) => {
  const headManager = useHead()
  const provider = headManager.createProvider()
  
  onMount(() => {
    return () => {
      provider.disconnect()
    }
  })

  return () => {
    let childrens = props.children
    if (typeof childrens === 'object' && !Array.isArray(childrens)) {
      childrens = [childrens]
    } else if (childrens == null) {
      childrens = []
    }

    childrens = (childrens as Kiru.VNode[]).map(
      el => renderToString(() => ({
        ...el,
        props: {
          ...el.props,
          inertia: true,
        }
      }))
    )

    if (props.title) {
      childrens.splice(0, 0, `<title inertia="true">${props.title}</title>`)
    }

    provider.update(childrens as string[])
    return null
  }
}
