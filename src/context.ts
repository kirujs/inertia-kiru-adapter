import { createHeadManager, Page } from "@inertiajs/core";
import { createContext, Signal, useContext } from "kiru";

export const PageContext = createContext<Signal<Page | null> | null>(null)
PageContext.displayName = 'InertiaPageContext'
export const usePage = () => {
  return useContext(PageContext)!
}

export const HeadContext = createContext<ReturnType<typeof createHeadManager> | null>(null)
HeadContext.displayName = 'InertiaHeadContext'
export const useHead = () => {
  return useContext(HeadContext)!
}
