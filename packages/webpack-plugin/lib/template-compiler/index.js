const compiler = require('./compiler')
const bindThis = require('./bind-this')
const parseRequest = require('../utils/parse-request')
const { matchCondition } = require('../utils/match-condition')
const loaderUtils = require('loader-utils')
const { generateVariableNameBySource } = require('../utils/get-compress-key')

const isProductionLikeMode = options => {
  return options.mode === 'production' || !options.mode
}

module.exports = function (raw) {
  this.cacheable()
  const { resourcePath, queryObj } = parseRequest(this.resource)
  const mpx = this.getMpx()
  const root = mpx.projectRoot
  const mode = mpx.mode
  const env = mpx.env
  const defs = mpx.defs
  const i18n = mpx.i18n
  const externalClasses = mpx.externalClasses
  const decodeHTMLText = mpx.decodeHTMLText
  const globalSrcMode = mpx.srcMode
  const localSrcMode = queryObj.mode
  const packageName = queryObj.packageRoot || mpx.currentPackageRoot || 'main'
  const componentsMap = mpx.componentsMap[packageName]
  const pagesMap = mpx.pagesMap
  const wxsContentMap = mpx.wxsContentMap
  const optimizeRenderRules = mpx.optimizeRenderRules
  const usingComponents = queryObj.usingComponents || []
  const componentPlaceholder = queryObj.componentPlaceholder || []
  const hasComment = queryObj.hasComment
  const isNative = queryObj.isNative
  const hasScoped = queryObj.hasScoped
  const moduleId = queryObj.moduleId || '_' + mpx.pathHash(resourcePath)

  let optimizeRenderLevel = 0
  for (const rule of optimizeRenderRules) {
    if (matchCondition(resourcePath, rule)) {
      optimizeRenderLevel = rule.level || 1
      break
    }
  }
  const warn = (msg) => {
    this.emitWarning(
      new Error('[template compiler][' + this.resource + ']: ' + msg)
    )
  }

  const error = (msg) => {
    this.emitError(
      new Error('[template compiler][' + this.resource + ']: ' + msg)
    )
  }

  const { root: ast, meta } = compiler.parse(raw, {
    warn,
    error,
    usingComponents,
    componentPlaceholder,
    hasComment,
    isNative,
    isComponent: !!componentsMap[resourcePath],
    isPage: !!pagesMap[resourcePath],
    mode,
    env,
    srcMode: localSrcMode || globalSrcMode,
    defs,
    decodeHTMLText,
    externalClasses,
    hasScoped,
    moduleId,
    // 这里需传递resourcePath和wxsContentMap保持一致
    filePath: resourcePath,
    i18n,
    checkUsingComponents: matchCondition(resourcePath, mpx.checkUsingComponentsRules),
    globalComponents: Object.keys(mpx.usingComponents),
    forceProxyEvent: matchCondition(resourcePath, mpx.forceProxyEventRules),
    hasVirtualHost: matchCondition(resourcePath, mpx.autoVirtualHostRules)
  })

  // 组件名压缩
  if (this.options.optimizeSize && isProductionLikeMode(compiler.options) && mode !== 'web') {
    function walkNode (root, callback) {
      if (!root) return
      callback(root)
      if (Array.isArray(root.children) && root.children.length) {
        for (const node of root.children) {
          if (!node) continue
          walkNode(node, callback)
        }
      }
    }
    // 记录所有原生组件（判断条件：usingComponents中不存在的组件）
    const nativeTags = new Set()
    walkNode(ast, (node) => {
      if (node.tag && usingComponents.indexOf(node.tag) === -1) {
        nativeTags.add(node.tag)
      }
    })
    walkNode(ast, (node) => {
      // 只有自定义组件才替换（判断条件：在usingComponents中的组件），并且新组件名不允许出现原生组件名
      if (node.tag && usingComponents.indexOf(node.tag) !== -1) {
        node.tag = generateVariableNameBySource(node.tag, resourcePath + 'componentName', [...nativeTags])
      }
    })
  }

  if (meta.wxsContentMap) {
    for (const module in meta.wxsContentMap) {
      wxsContentMap[`${resourcePath}~${module}`] = meta.wxsContentMap[module]
    }
  }

  const result = compiler.serialize(ast)

  if (isNative) {
    return result
  }

  let resultSource = ''

  for (const module in meta.wxsModuleMap) {
    const src = loaderUtils.urlToRequest(meta.wxsModuleMap[module], root)
    resultSource += `var ${module} = require(${loaderUtils.stringifyRequest(this, src)});\n`
  }
  // currentInject -> _cj
  resultSource += `
global._cj = {
  moduleId: ${JSON.stringify(moduleId)}
};\n`

  const rawCode = compiler.genNode(ast)
  if (rawCode) {
    try {
      const ignoreMap = Object.assign({
        _i: true,
        _c: true,
        _sc: true,
        _r: true
      }, meta.wxsModuleMap)
      const bindResult = optimizeRenderLevel === 2
        ? bindThis.transformSimple(rawCode, {
          ignoreMap
        })
        : bindThis.transform(rawCode, {
          needCollect: true,
          renderReduce: optimizeRenderLevel === 1,
          ignoreMap
        })
      resultSource += `
global._cj.render = function (_i, _c, _r, _sc) {
${bindResult.code}
_r(${optimizeRenderLevel === 2 ? 'true' : ''});
};\n`
      if ((mode === 'tt' || mode === 'swan') && bindResult.propKeys) {
        resultSource += `global.currentInject.propKeys = ${JSON.stringify(bindResult.propKeys)};\n`
      }
    } catch (e) {
      error(`
Invalid render function generated by the template, please check!\n
Template result:
${result}\n
Error code:
${rawCode}
Error Detail:
${e.stack}`)
      return result
    }
  }

  if (meta.computed) {
    resultSource += bindThis.transform(`
global._cj.injectComputed = {
  ${meta.computed.join(',')}
};`).code + '\n'
  }

  if (meta.refs) {
    resultSource += `
global._cj.getRefsData = function () {
  return ${JSON.stringify(meta.refs)};
};\n`
  }

  if (meta.options) {
    resultSource += `global._cj.injectOptions = ${JSON.stringify(meta.options)};` + '\n'
  }

  this.emitFile(resourcePath, '', undefined, {
    skipEmit: true,
    extractedResultSource: resultSource
  })

  return result
}
