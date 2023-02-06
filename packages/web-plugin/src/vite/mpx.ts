interface Mpx {
  entry?: string
  pagesMap: Record<string, string>
  componentsMap: Record<string, string>
  pagesEntryMap: Record<string, string>
}

const mpx: Mpx = {
  entry: undefined,
  pagesMap: {},
  componentsMap: {},
  pagesEntryMap: {}
}

export default mpx
