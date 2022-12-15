import { stringifyRequest as _stringifyRequest, urlToRequest } from 'loader-utils'
import addQuery from '@mpxjs/compile-utils/add-query'
import genComponentTag from '@mpxjs/compile-utils/gen-component-tag'
import createHelpers from '@mpxjs/compile-utils/helpers'
import stringify, { shallowStringify } from '../../utils/stringify'
import mpx from '../mpx'
import { proxyPluginContext } from '../../pluginContextProxy'
import { genImport } from '../../utils/genCode'
import MagicString from 'magic-string'
import { LoaderContext } from 'webpack'
import { JsonConfig } from '../../types/json-config'
import { SFCDescriptor } from '../../types/compiler'

const optionProcessorPath = '@mpxjs/web-plugin/src/runtime/optionProcessor'
const tabBarContainerPath = '@mpxjs/web-plugin/src/runtime/components/web/mpx-tab-bar-container.vue'
const tabBarPath = '@mpxjs/web-plugin/src/runtime/components/web/mpx-tab-bar.vue'

function getAsyncChunkName(chunkName: boolean | string) {
  if (chunkName && typeof chunkName !== 'boolean') {
    return `/* webpackChunkName: "${ chunkName }" */`
  }
  return ''
}

export default function (script: { content?: string, tag: 'script', attrs?: Record<string, string>, src?: string, lang?: string, mode?: 'wx'}, {
  loaderContext,
  ctorType,
  moduleId,
  componentGenerics,
  jsonConfig,
  outputPath,
  tabBarMap,
  tabBarStr,
  builtInComponentsMap,
  genericsInfo,
  wxsModuleMap,
  localComponentsMap,
  localPagesMap
}: {
  loaderContext: LoaderContext<null> | any
  moduleId: string
  ctorType: string
  outputPath: string,
  componentGenerics: JsonConfig['componentGenerics'],
  tabBarMap: SFCDescriptor['tabBarMap']
  tabBarStr: SFCDescriptor['tabBarStr']
  jsonConfig: JsonConfig
  builtInComponentsMap: SFCDescriptor['builtInComponentsMap']
  genericsInfo: SFCDescriptor['genericsInfo'],
  wxsModuleMap: SFCDescriptor['wxsModuleMap'],
  localComponentsMap: SFCDescriptor['localPagesMap']
  localPagesMap: SFCDescriptor['localPagesMap']

}, callback: (err?: Error | null, result?: any) => void) {
  const {
    i18n,
    projectRoot,
    webConfig = {},
    // appInfo,
    srcMode,
    minimize
  } = mpx

  const mpxPluginContext = proxyPluginContext(loaderContext)
  const { getRequire } = createHelpers(loaderContext)
  const tabBar = jsonConfig.tabBar
  const tabBarPagesMap: Record<string, string> = {}
  const isProduction = minimize || process.env.NODE_ENV === 'production'
  const stringifyRequest = (r: string) => _stringifyRequest(loaderContext, r)
  const genComponentCode = (resource: string, { async = false } = {}, params = {}) => {
    const resourceRequest = stringifyRequest(resource)
    if (!async) {
      return `getComponent(require(${ resourceRequest }), ${ stringify(params) })`
    } else {
      return `()=>import(${ getAsyncChunkName(async) }${ resourceRequest }).then(res => getComponent(res, ${ stringify(params) }))`
    }
  }


  if (tabBar && tabBarMap) {
    // 挂载tabBar组件
    const tabBarRequest = addQuery(tabBar.custom ? './custom-tab-bar/index' : tabBarPath, { isComponent: true })
    tabBarPagesMap['mpx-tab-bar'] = genComponentCode(tabBarRequest)
    // 挂载tabBar页面
    Object.keys(tabBarMap).forEach((pagePath) => {
      const pageCfg = localPagesMap[pagePath]
      const { resource, async } = pageCfg
      if (pageCfg) {
        tabBarPagesMap[pagePath] = genComponentCode(resource, { async }, { __mpxPageRoute: JSON.stringify(pagePath) })
      } else {
        mpxPluginContext.warn(new Error(`[script processor][${ loaderContext.resource }]: TabBar page path ${ pagePath } is not exist in local page map, please check!`))
      }
    })
  }

  let output = '/* script */\n'

  let scriptSrcMode = srcMode
  if (script) {
    scriptSrcMode = script.mode || scriptSrcMode
  } else {
    script = { tag: 'script' }
  }
  // @ts-ignore
  output += genComponentTag(script, {
    attrs(script: { attrs: { src?: string; setup?: boolean}}) {
      const attrs = Object.assign({}, script.attrs)
      // src改为内联require，删除
      delete attrs.src
      // script setup通过mpx处理，删除该属性避免vue报错
      delete attrs.setup
      return attrs
    },
    content: function (script: { content?: string }) {
      const content = new MagicString(`\n  import processOption, { getComponent, getWxsMixin } from ${ stringifyRequest(optionProcessorPath) }\n`)
      // add import
      if (ctorType === 'app') {
        content.append(
          `${ genImport('@mpxjs/web-plugin/src/runtime/base.styl') }
          ${ genImport('vue', 'Vue') }
          ${ genImport('vue-router', 'VueRouter') }
           ${ genImport('@mpxjs/core', 'Mpx') }
          Vue.use(VueRouter)
          global.getApp = function(){}
          global.getCurrentPages = function(){
            if(!global.__mpxRouter) return []
            // @ts-ignore
            return global.__mpxRouter.stack.map(item => {
            let page
            const vnode = item.vnode
            if(vnode && vnode.componentInstance) {
              page = vnode.tag.endsWith('mpx-tab-bar-container') ? vnode.componentInstance.$refs.tabBarPage : vnode.componentInstance
            }
            return page || { route: item.path.slice(1) }
          })
        }
        global.__networkTimeout = ${ JSON.stringify(jsonConfig.networkTimeout) }
        global.__mpxGenericsMap = {}
        global.__mpxOptionsMap = {}
        global.__style = ${ JSON.stringify(jsonConfig.style || 'v1') }
        global.__mpxPageConfig = ${ JSON.stringify(jsonConfig.window) }
        global.__mpxTransRpxFn = ${ webConfig.transRpxFn }\n`
        )
        if (i18n) {
          const i18nObj = Object.assign({}, i18n)
          content.append(
            `${ genImport('vue-i18n', 'VueI18n') }
            Vue.use(VueI18n)
            `
          )
          const requestObj: Record<string, string> = {}
          const i18nKeys = ['messages', 'dateTimeFormats', 'numberFormats']
          i18nKeys.forEach((key) => {
            if (i18nObj[`${ key }Path`]) {
              requestObj[key] = stringifyRequest(i18nObj[`${ key }Path`])
              delete i18nObj[`${ key }Path`]
            }
          })
          content.append(`  const i18nCfg = ${ JSON.stringify(i18nObj) }\n`)
          Object.keys(requestObj).forEach((key) => {
            content.append(`  i18nCfg.${ key } = require(${ requestObj[key] })\n`)
          })
          content.append(`  const i18n = new VueI18n(i18nCfg)
            i18n.mergeMessages = (newMessages) => {
              Object.keys(newMessages).forEach((locale) => {
                i18n.mergeLocaleMessage(locale, newMessages[locale])
              })
            }
            Mpx.i18n = i18n
            \n`
          )
        }
      }
      // let hasApp = true
      // if (!appInfo || !appInfo.name) {
      //   hasApp = false
      // }
      // 注入wxs模块
      content.append('  const wxsModules = {}\n')
      if (wxsModuleMap) {
        Object.keys(wxsModuleMap).forEach((module) => {
          const src = urlToRequest(wxsModuleMap[module], projectRoot)
          // const expression = `require(${ stringifyRequest(src) })`
          content.append(`  wxsModules.${ module } = require(${ stringifyRequest(src) })\n`)
        })
      }
      const pagesMap: Record<string, string> = {}
      const componentsMap: Record<string, string> = {}
      Object.keys(localPagesMap).forEach((pagePath) => {
        const pageCfg = localPagesMap[pagePath]
        const { resource, async } = pageCfg
        const isTabBar = tabBarMap && tabBarMap[pagePath]
        pagesMap[pagePath] = genComponentCode(
          isTabBar ? tabBarContainerPath : resource,
          {
            async: isTabBar ? false : async
          },
          isTabBar ? { __mpxBuiltIn: true } : { __mpxPageRoute: JSON.stringify(pagePath) }
        )
      })
      Object.keys(localComponentsMap).forEach((componentName) => {
        const componentCfg = localComponentsMap[componentName]
        const { resource, async } = componentCfg
        componentsMap[componentName] = genComponentCode(resource, { async })
      })

      Object.keys(builtInComponentsMap).forEach((componentName) => {
        const componentCfg = builtInComponentsMap[componentName]
        componentsMap[componentName] = genComponentCode(componentCfg.resource, { async: false }, { __mpxBuiltIn: true })
      })
      content.append(
        `  global.currentModuleId = ${ JSON.stringify(moduleId) }\n
           global.currentSrcMode = ${ JSON.stringify(scriptSrcMode) }\n
        `
      )
      if (!isProduction) {
        content.append(`  global.currentResource = ${ JSON.stringify(loaderContext.resourcePath) }\n`)
      }
      content.append('  /** script content **/\n')
      // 传递ctorType以补全js内容
      const extraOptions = { ctorType }
      // todo 仅靠vueContentCache保障模块唯一性还是不够严谨，后续需要考虑去除原始query后构建request
      // createApp/Page/Component执行完成后立刻获取当前的option并暂存
      content.append(
        `  ${ getRequire('script', script, extraOptions) }\n
        const currentOption = global.__mpxOptionsMap[${ JSON.stringify(moduleId) }]\n
        `
      )
      // 获取pageConfig
      const pageConfig: Record<string, string | Record<string, unknown>> = {}
      if (ctorType === 'page') {
        const uselessOptions = new Set([
          'usingComponents',
          'style',
          'singlePage'
        ])
        Object.keys(jsonConfig)
          .filter(key => !uselessOptions.has(key))
          .forEach(key => {
            // @ts-ignore
            pageConfig[key] = jsonConfig[key]
          })
      }
      // 为了执行顺序正确，tabBarPagesMap在app逻辑执行完成后注入，保障小程序中app->page->component的js执行顺序
      if (tabBarStr && tabBarPagesMap) {
        content.append(
          `  global.__tabBar = ${ tabBarStr }
             Vue.observable(global.__tabBar)
             // @ts-ignore
            global.__tabBarPagesMap = ${ shallowStringify(tabBarPagesMap) }\n
          `
        )
      }

      // 配置平台转换通过createFactory在core中convertor中定义和进行
      // 通过processOption进行组件注册和路由注入
      content.append(`  export default processOption(
        currentOption,
        ${ JSON.stringify(ctorType) },
        ${ JSON.stringify(Object.keys(localPagesMap)[0]) },
        ${ JSON.stringify(outputPath) },
        ${ JSON.stringify(pageConfig) },
        // @ts-ignore
        ${ shallowStringify(pagesMap) },
        // @ts-ignore
        ${ shallowStringify(componentsMap) },
        ${ JSON.stringify(tabBarMap) },
        ${ JSON.stringify(componentGenerics) },
        ${ JSON.stringify(genericsInfo) },
        getWxsMixin(wxsModules)
        ${ ctorType === 'app' ? i18n ? `,Vue,VueRouter,i18n` : `,Vue, VueRouter` : '' })`
      )
      return content.toString()
    }
  })
  output += '\n'
  callback(null, {
    output
  })
}
