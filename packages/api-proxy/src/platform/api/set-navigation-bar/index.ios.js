import { successHandle, failHandle } from '../../../common/js'

function getFocusedNavigation () {
  for (const key in global.__mpxPagesMap) {
    const navigation = global.__mpxPagesMap[key]?.[1]
    if (navigation && navigation.isFocused()) {
      return navigation
    }
  }
}
function setNavigationBarTitle (options = {}) {
  const { title = '', success, fail, complete } = options
  const navigation = getFocusedNavigation()
  if (!(navigation && navigation.setOptions)) {
    failHandle({ errMsg: 'setNavigationBarTitle:fail' }, fail, complete)
  } else {
    navigation.setOptions({ headerTitle: title })
    successHandle({ errMsg: 'setNavigationBarTitle:ok' }, success, complete)
  }
}

function setNavigationBarColor (options = {}) {
  const { frontColor = '', backgroundColor = '', success, fail, complete } = options
  const navigation = getFocusedNavigation()
  if (!(navigation && navigation.setOptions)) {
    failHandle({ errMsg: 'setNavigationBarColor:fail' }, fail, complete)
  } else {
    navigation.setOptions({
      headerStyle: {
        backgroundColor: backgroundColor
      },
      headerTintColor: frontColor
    })
    successHandle({ errMsg: 'setNavigationBarColor:ok' }, success, complete)
  }
}

export {
  setNavigationBarTitle,
  setNavigationBarColor
}
