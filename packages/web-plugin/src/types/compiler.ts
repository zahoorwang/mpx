import { CompilerResult, ParseResult, templateCompiler } from '@mpxjs/compiler'
import parseComponent from '@mpxjs/compiler/template-compiler/parser'
import { JsonConfig } from './json-config'

export * from '@mpxjs/compiler'

type MpxCompiler = typeof templateCompiler

export interface SFCDescriptor extends CompilerResult {
  id: string
  filename: string
  app: boolean
  isPage: boolean
  isComponent: boolean
  jsonConfig: JsonConfig
  builtInComponentsMap: Record<
    string,
    {
      resource: string
    }
  >
  genericsInfo?: Record<string, unknown>
  localPagesMap: {
    [key: string]: {
      resource: string
      async: boolean
    }
  }
  localComponentsMap: {
    [key: string]: {
      resource: string
      async: boolean
    }
  }
  wxsModuleMap: Record<string, string>
  wxsContentMap: Record<string, string>
  tabBarMap: Record<string, unknown>
  tabBarStr: string,
  vueSfc: string
}

interface Compiler extends MpxCompiler {
  parseComponent(
    template: string,
    options: Parameters<MpxCompiler['parseComponent']>[1]
  ): SFCDescriptor
  parse(
    template: string,
    options: Parameters<MpxCompiler['parse']>[1]
  ): ParseResult
  serialize: MpxCompiler['serialize']
}

const compiler: Compiler = {
  ...templateCompiler,
  parseComponent(template, options) {
    const descriptor = parseComponent(template, options) as SFCDescriptor
    if (descriptor.script && descriptor.script.map) {
      const sources = descriptor.script.map.sources || []
      descriptor.script.map.sources = sources.map(
        (v: string) => v.split('?')[0]
      )
    }
    return descriptor
  }
}

export default compiler
