import { isArray } from 'util'
import { ExpirationTime } from '../react-fiber/expiration-time'
import { createFiberFromElement, createFiberFromPortal, createFiberFromText, createFiberFromTypeAndProps, createWorkInProgress, Fiber } from '../react-fiber/fiber'
import { Deletion, Placement } from '../react-type/effect-type'
import { REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, REACT_PORTAL_TYPE, REACT_PROFILER_TYPE, ReactPortal } from '../react-type/react-type'
import { Fragment, HostPortal, HostText } from '../react-type/tag-type'
import { ReactElement } from '../react/react'
import { isObject, isText } from '../utils/getType'

function useFiber(fiber: Fiber, pendingProps: any): Fiber {
  const clone = createWorkInProgress(fiber, pendingProps)

  clone.index = 0
  clone.sibling = null
  return clone
}

function ChildReconciler(shouldTrackSideEffects) {
  function deleteChild(returnFiber: Fiber, childToDelete: Fiber) {
    if (!shouldTrackSideEffects) {
      return
    }

    const last = returnFiber.lastEffect

    if (last !== null) {
      last.nextEffect = childToDelete
      returnFiber.lastEffect = childToDelete
    } else {
      returnFiber.firstEffect = returnFiber.lastEffect = childToDelete
    }

    childToDelete.nextEffect = null
    childToDelete.effectTag = Deletion
  }

  function deleteRemainingChildren(returnFiber: Fiber, currentFirstChild: Fiber) {
    if (!shouldTrackSideEffects) {
      return
    }

    let childToDelete: Fiber = currentFirstChild
    while (childToDelete !== null) {
      deleteChild(returnFiber, childToDelete)
      childToDelete = childToDelete.sibling
    }
  }

  function placeChild(newFiber: Fiber, lastPlacedIndex: number, newIdx: number): number {
    newFiber.index = newIdx

    if (!shouldTrackSideEffects) {
      return lastPlacedIndex
    }

    const current = newFiber.alternate
    if (current !== null) {
      const oldIndex = current.index
      if (oldIndex < lastPlacedIndex) {
        newFiber.effectTag = Placement // 需要移动
        return lastPlacedIndex
      } else {
        return oldIndex
      }
    } else {
      newFiber.effectTag = Placement
      return lastPlacedIndex
    }
  }


  function placeSingleChild(newFiber: Fiber): Fiber {
    if (shouldTrackSideEffects && newFiber.alternate === null) {
      newFiber.effectTag = Placement
    }
    return newFiber
  }

  function updateFragment(returnFiber: Fiber, current: Fiber, newChild: any, expirationTime: ExpirationTime, key: string | null): Fiber {
    let fiber: Fiber = null
    if (current !== null && current.tag !== Fragment) {
      fiber = createFiberFromTypeAndProps(REACT_FRAGMENT_TYPE, key, newChild.props.children, returnFiber.mode, expirationTime)
    } else {
      fiber = useFiber(current, newChild.props.children)
    }

    fiber.return = returnFiber
    return fiber
  }

  function updateTextNode(returnFiber: Fiber, current: Fiber, textContent: string, expirationTime: ExpirationTime): Fiber {
    let fiber: Fiber = null
    if (current !== null && current.tag === HostText) {
      fiber = createFiberFromText(textContent, returnFiber.mode, expirationTime)
    } else {
      fiber = useFiber(current, textContent)
    }

    fiber.return = returnFiber
    return fiber
  }

  function updateElement(returnFiber: Fiber, current: Fiber, element: ReactElement, expirationTime: ExpirationTime): Fiber {
    let fiber: Fiber = null
    if (current !== null && current.elementType !== element.type) {
      fiber = createFiberFromElement(element, returnFiber.mode, expirationTime)
    } else {
      fiber = useFiber(current, element.props)
    }

    // fiber.ref = coerceRef(returnFiber, current, element) // 待实现
    fiber.return = returnFiber
    return fiber
  }

  function updatePortal(returnFiber: Fiber, current: Fiber, portal: ReactPortal, expirationTime: ExpirationTime): Fiber {
    let fiber: Fiber = null
    if (current === null || current.tag !== HostPortal || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation) {
      fiber = createFiberFromPortal(portal, returnFiber.mode, expirationTime)
    } else {
      fiber = useFiber(current, portal.children || [])
    }

    fiber.return = returnFiber
    return fiber
  }

  function updateSlot(returnFiber: Fiber, oldFiber: Fiber, newChild: any, expirationTime: ExpirationTime) {
    const key = oldFiber !== null ? oldFiber.key : null

    if (isText(newChild)) {
      if (key !== null) {
        return null
      }

      return updateTextNode(returnFiber, oldFiber, '' + newChild, expirationTime)
    }

    if (isObject(newChild)) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          if (newChild.key === key) {
            if (newChild.type === REACT_FRAGMENT_TYPE) {
              return updateFragment(returnFiber, oldFiber, newChild, expirationTime, key)
            }

            return updateElement(returnFiber, oldFiber, newChild, expirationTime)
          } else {
            return null
          }
        case REACT_PORTAL_TYPE:
          if (newChild.key === key) {
            return updatePortal(returnFiber, oldFiber, newChild, expirationTime)
          } else {
            return null
          }
      }
    }

    if (isArray(newChild)) {
      if (key !== null) {
        return null
      }

      return updateFragment(returnFiber, oldFiber, newChild.props.children, expirationTime, null)
    }

    return null
  }

  function reconcileSingleElement(returnFiber: Fiber, currentFirstChild: Fiber, element: ReactElement, expirationTime: ExpirationTime): Fiber {
    let child: Fiber = currentFirstChild

    while (child != null) {
      if (child.key === element.key) {
        if (child.tag === Fragment ? element.type === REACT_FRAGMENT_TYPE : child.elementType === element.type) {
          deleteRemainingChildren(returnFiber, child.sibling)

          const existing = useFiber(child, element.type === REACT_FRAGMENT_TYPE ? element.props.child : element.props)
          // existing.ref = coerceRef(returnFiber, child, element) // 待实现，处理Ref
          existing.return = returnFiber

          return existing
        } else {
          deleteRemainingChildren(returnFiber, child)
          break
        }
      } else {
        deleteChild(returnFiber, child)
      }

      child = child.sibling
    }

    const created = createFiberFromElement(element, returnFiber.mode, expirationTime)
    if (element.type !== REACT_FRAGMENT_TYPE) {
      // created.ref = coerceRef(returnFiber, child, element) // 待实现，处理Ref
    }

    created.return = returnFiber
    return created
  }

  // 待实现
  function reconcileSinglePortal(returnFiber: Fiber, currentFirstChild: Fiber, portal: ReactElement, expirationTime: ExpirationTime): Fiber {
    return returnFiber
  }

  function reconcileSingleTextNode(returnFiber: Fiber, currentFirstChild: Fiber, textContent: string, expirationTime: ExpirationTime): Fiber {
    if (currentFirstChild !== null && currentFirstChild.tag === HostText) {
      deleteRemainingChildren(returnFiber, currentFirstChild.sibling)

      const existing = useFiber(currentFirstChild, textContent)
      existing.return = returnFiber

      return existing
    }

    deleteRemainingChildren(returnFiber, currentFirstChild)
    const created = createFiberFromText(textContent, returnFiber.mode, expirationTime)
    created.return = returnFiber

    return created
  }

  function reconcileChildrenArray(returnFiber: Fiber, currentFirstChild: Fiber, newChildren: any[], expirationTime: ExpirationTime): Fiber {
    let resultingFirstChild: Fiber = null
    let previousNewFiber: Fiber = null

    let oldFiber: Fiber = currentFirstChild
    let lastPlacedIndex: number = 0

    let newIdx: number = 0
    let nextOldFiber: Fiber = null

    for (; oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      if (oldFiber.index > newIdx) {
        nextOldFiber = oldFiber
        oldFiber = null
      } else {
        nextOldFiber = oldFiber.sibling
      }
      const newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], expirationTime)

      if (newFiber === null) {
        if (oldFiber === null) {
          oldFiber = nextOldFiber
        }
        break
      }

      if (shouldTrackSideEffects && (oldFiber && newFiber.alternate === null)) {
        deleteChild(returnFiber, oldFiber)
      }

      lastPlacedIndex = placeChild(newFiber, lastPlacedIndex, newIdx)

      if (previousNewFiber === null) {
        resultingFirstChild = previousNewFiber
      } else {
        previousNewFiber.sibling = newFiber
      }
      previousNewFiber = newFiber
      oldFiber = nextOldFiber
    }
  }

  return (returnFiber: Fiber, currentFirstChild: Fiber, newChild: any, expirationTime: ExpirationTime): Fiber => {
    // 处理fragment
    const isUnkeyedTopLevelFragment = isObject(newChild) && newChild.type === REACT_FRAGMENT_TYPE && newChild.key === null
    if (isUnkeyedTopLevelFragment) {
      newChild = newChild.props.children
    }

    if (isObject(newChild)) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return placeSingleChild(reconcileSingleElement(returnFiber, currentFirstChild, newChild, expirationTime))
        case REACT_PROFILER_TYPE:
          return placeSingleChild(reconcileSinglePortal(returnFiber, currentFirstChild, newChild, expirationTime))
      }
    }

    if (isText(newChild)) {
      return placeSingleChild(reconcileSingleTextNode(returnFiber, currentFirstChild, newChild, expirationTime))
    }

    if (isArray(newChild)) {
      return reconcileChildrenArray(returnFiber, currentFirstChild, newChild, expirationTime)
    }
  }
}

function reconcileChildren(current: Fiber, workInProgress: Fiber, nextChildren: any, renderExpirationTime: ExpirationTime) {
  const mountChildFibers = ChildReconciler(false)
  const reconcileChildFibers = ChildReconciler(true)

  if (current === null) {
    workInProgress.child = mountChildFibers(workInProgress, null, nextChildren, renderExpirationTime)
  } else {
    workInProgress.child = reconcileChildFibers(workInProgress, current.child, nextChildren, renderExpirationTime)
  }
}

export { reconcileChildren }