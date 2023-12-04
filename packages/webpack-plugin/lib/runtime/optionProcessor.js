import { hasOwn } from './utils'
import { isBrowser } from './env'
import transRpxStyle from './transRpxStyle'
import animation from './animation'

export default function processComponentOption (
  {
    option,
    ctorType,
    outputPath,
    pageConfig,
    componentsMap,
    componentGenerics,
    genericsInfo,
    mixin,
    hasApp
  }
) {
  // 局部注册页面和组件中依赖的组件
  for (const componentName in componentsMap) {
    if (hasOwn(componentsMap, componentName)) {
      const component = componentsMap[componentName]
      if (!option.components) {
        option.components = {}
      }
      option.components[componentName] = component
    }
  }

  if (genericsInfo) {
    const genericHash = genericsInfo.hash
    global.__mpxGenericsMap[genericHash] = {}
    Object.keys(genericsInfo.map).forEach((genericValue) => {
      if (componentsMap[genericValue]) {
        global.__mpxGenericsMap[genericHash][genericValue] = componentsMap[genericValue]
      } else {
        console.warn(`[Mpx runtime warn]: generic value "${genericValue}" must be
registered in parent context!`)
      }
    })
  }

  if (componentGenerics) {
    option.props = option.props || {}
    option.props.generichash = String
    Object.keys(componentGenerics).forEach((genericName) => {
      if (componentGenerics[genericName].default) {
        option.props[`generic${genericName}`] = {
          type: String,
          default: `${genericName}default`
        }
      } else {
        option.props[`generic${genericName}`] = String
      }
    })
  }

  if (ctorType === 'page') {
    option.__mpxPageConfig = Object.assign({}, global.__mpxPageConfig, pageConfig)
  }

  if (!hasApp) {
    option.directives = { animation }
    option.filters = { transRpxStyle }
  }

  if (option.mixins) {
    option.mixins.push(mixin)
  } else {
    option.mixins = [mixin]
  }

  if (outputPath) {
    option.componentPath = '/' + outputPath
  }

  return option
}

export function getComponent (component, extendOptions) {
  component = component.__esModule ? component.default : component
  // eslint-disable-next-line
  if (extendOptions) Object.assign(component, extendOptions)
  return component
}

export function getWxsMixin (wxsModules) {
  if (!wxsModules || !Object.keys(wxsModules).length) return {}
  return {
    created () {
      Object.keys(wxsModules).forEach((key) => {
        if (key in this) {
          console.error(`[Mpx runtime error]: The wxs module key [${key}] exist in the component/page instance already, please check and rename it!`)
        } else {
          this[key] = wxsModules[key]
        }
      })
    }
  }
}

function createApp ({ componentsMap, Vue, pagesMap, firstPage, VueRouter, App, tabBarMap }) {
  const option = {}

  if (App.onAppInit) {
    Object.assign(option, App.onAppInit() || {})
  }

  if (isBrowser && global.__mpxPinia) {
    // 注入pinia
    option.pinia = global.__mpxPinia
  }

  // const app = new Vue({
  //   ...option,
  //   render: (h) => h(App)
  // })
  const app = Vue.createApp({
    ...option,
    render: (h) => h(App)
  })

  app.directive('animation', animation)

  // 过滤器需要重写
  // Vue.filter('transRpxStyle', transRpxStyle)

  app.config.ignoredElements = ['page']

  // 对于app中的组件需要全局注册
  for (const componentName in componentsMap) {
    if (hasOwn(componentsMap, componentName)) {
      const component = componentsMap[componentName]
      app.component(componentName, component)
    }
  }

  const routes = []

  for (const pagePath in pagesMap) {
    if (hasOwn(pagesMap, pagePath)) {
      const page = pagesMap[pagePath]
      routes.push({
        path: '/' + pagePath,
        component: page
      })
    }
  }

  if (routes.length) {
    if (firstPage) {
      routes.push({
        path: '/',
        redirect: '/' + firstPage
      })
    }
    const webRouteConfig = global.__mpx.config.webRouteConfig
    global.__mpxRouter = option.router = new VueRouter({
      ...webRouteConfig,
      routes: routes
    })
    global.__mpxRouter.stack = []
    global.__mpxRouter.lastStack = null
    global.__mpxRouter.needCache = null
    global.__mpxRouter.needRemove = []
    global.__mpxRouter.eventChannelMap = {}
    // 处理reLaunch中传递的url并非首页时的replace逻辑
    global.__mpxRouter.beforeEach(function (to, from, next) {
      let action = global.__mpxRouter.__mpxAction
      const stack = global.__mpxRouter.stack

      // 处理人为操作
      if (!action) {
        if (stack.length > 1 && stack[stack.length - 2].path === to.path) {
          action = {
            type: 'back',
            delta: 1
          }
        } else {
          action = {
            type: 'to'
          }
        }
      }

      const pageInRoutes = routes.some(item => item.path === to.path)
      if (!pageInRoutes) {
        if (stack.length < 1) {
          if (global.__mpxRouter.app.$options.onPageNotFound) {
            // onPageNotFound，仅首次进入时生效
            global.__mpxRouter.app.$options.onPageNotFound({
              path: to.path,
              query: to.query,
              isEntryPage: true
            })
            return
          } else {
            console.warn(`[Mpx runtime warn]: the ${to.path} path does not exist in the application，will redirect to the home page path ${firstPage}`)
            return next({
              path: firstPage,
              replace: true
            })
          }
        } else {
          const typeMethodMap = {
            to: 'navigateTo',
            redirect: 'redirectTo',
            back: 'navigateBack',
            switch: 'switchTab',
            reLaunch: 'reLaunch'
          }
          const method = typeMethodMap[action.type]
          throw new Error(`${method}:fail page "${to.path}" is not found`)
        }
      }

      const insertItem = {
        path: to.path
      }
      // 构建历史栈
      switch (action.type) {
        case 'to':
          stack.push(insertItem)
          global.__mpxRouter.needCache = insertItem
          if (action.eventChannel) global.__mpxRouter.eventChannelMap[to.path.slice(1)] = action.eventChannel
          break
        case 'back':
          global.__mpxRouter.needRemove = stack.splice(stack.length - action.delta, action.delta)
          break
        case 'redirect':
          global.__mpxRouter.needRemove = stack.splice(stack.length - 1, 1, insertItem)
          global.__mpxRouter.needCache = insertItem
          break
        case 'switch':
          if (!action.replaced) {
            action.replaced = true
            return next({
              path: action.path,
              replace: true
            })
          } else {
            // 将非tabBar页面remove
            let tabItem = null
            global.__mpxRouter.needRemove = stack.filter((item) => {
              if (tabBarMap[item.path.slice(1)] && !tabItem) {
                tabItem = item
                tabItem.path = to.path
                return false
              }
              return true
            })
            if (tabItem) {
              global.__mpxRouter.stack = [tabItem]
            } else {
              global.__mpxRouter.stack = [insertItem]
              global.__mpxRouter.needCache = insertItem
            }
          }
          break
        case 'reLaunch':
          if (!action.replaced) {
            action.replaced = true
            return next({
              path: action.path,
              query: {
                routeCount: action.routeCount
              },
              replace: true
            })
          } else {
            global.__mpxRouter.needRemove = stack
            global.__mpxRouter.stack = [insertItem]
            global.__mpxRouter.needCache = insertItem
          }
      }
      next()
    })
    // 处理visibilitychange时触发当前活跃页面组件的onshow/onhide
    if (isBrowser) {
      const errorHandler = function (args, fromVue) {
        if (global.__mpxAppCbs && global.__mpxAppCbs.error && global.__mpxAppCbs.error.length) {
          global.__mpxAppCbs.error.forEach((cb) => {
            cb.apply(null, args)
          })
        } else if (fromVue) {
          throw args[0]
        }
      }
      app.config.errorHandler = (...args) => {
        return errorHandler(args, true)
      }
      window.addEventListener('error', (event) => {
        return errorHandler([event.error, event])
      })
      window.addEventListener('unhandledrejection', (event) => {
        return errorHandler([event.reason, event])
      })
      document.addEventListener('visibilitychange', function () {
        const vnode = global.__mpxRouter && global.__mpxRouter.__mpxActiveVnode
        if (vnode && vnode.componentInstance) {
          const currentPage = vnode.tag.endsWith('mpx-tab-bar-container') ? vnode.componentInstance.$refs.tabBarPage : vnode.componentInstance
          if (document.hidden) {
            if (global.__mpxAppCbs && global.__mpxAppCbs.hide) {
              global.__mpxAppCbs.hide.forEach((cb) => {
                cb()
              })
            }
            if (currentPage) {
              currentPage.mpxPageStatus = 'hide'
            }
          } else {
            if (global.__mpxAppCbs && global.__mpxAppCbs.show) {
              global.__mpxAppCbs.show.forEach((cb) => {
                // todo 实现app.onShow参数
                /* eslint-disable node/no-callback-literal */
                cb({})
              })
            }
            if (currentPage) {
              currentPage.mpxPageStatus = 'show'
            }
          }
        }
      })
      // 初始化length
      global.__mpxRouter.__mpxHistoryLength = global.history.length
    }
  }
  return {
    app,
    ...option
  }
}

export function processAppOption ({ firstPage, pagesMap, componentsMap, App, Vue, VueRouter, tabBarMap, webConfig }) {
  if (!isBrowser) {
    return context => {
      const { app, router, pinia = {} } = createApp({
        App,
        componentsMap,
        Vue,
        pagesMap,
        firstPage,
        VueRouter,
        tabBarMap
      })
      if (App.onSSRAppCreated) {
        return App.onSSRAppCreated({ pinia, router, app, context })
      } else {
        return new Promise((resolve, reject) => {
          router.push(context.url)
          router.onReady(() => {
            context.rendered = () => {
              context.state = pinia?.state?.value || {}
            }
            resolve(app)
          }, reject)
        })
      }
    }
  } else {
    const { app, pinia } = createApp({
      App,
      componentsMap,
      Vue,
      pagesMap,
      firstPage,
      VueRouter,
      tabBarMap
    })
    if (window.__INITIAL_STATE__ && pinia) {
      pinia.state.value = window.__INITIAL_STATE__
    }
    app.$mount(webConfig.el || '#app')
  }
}
