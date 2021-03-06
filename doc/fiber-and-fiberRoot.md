# 源码解析一  `Fiber and FiberRoot`
`Fiber`出来之后，新的调和系统称为`fiber reconciler`，为了识别，我们把老的调和系统称为`stack reconciler`。 每一个`ReactElement`，都会生成相应的工作单元（我们把每个工作单元称为`Fiber`），根据这些节点的层级关系，会生成整个`Fiber`树。

我们的整个调和过程，都是围绕`Fiber`树展开的

## `stack reconciler` 和 `fiber reconciler`
在`stack reconciler中，整个VDOM树 如下图：

<img src="./fiber-and-fiberRoot/vdom_tree.png" width="350" height="290"/>

如果某个节点`setState`，会从当前节点开始，一直递归到整个`dom`树的最底层，找到需要修改的信息，并传递给`renderer`进行渲染。

这整个过程是一气呵成，连续不可中断的。如果需要渲染的组件树过于庞大，js执行占据主线程时间较长，导致页面响应度变差，就会很明显造成卡顿现象，整个过程类似下图：

<img src="./fiber-and-fiberRoot/stack.png" width="640" height="390"/>

为了解决这个问题，`React`重构了整个调和架构，称为新的`fiber reconciler`，它支持：
1. 对每个任务划分优先级，根据优先级不同区别处理
2. 能够把任务切片处理
3. 能够调整优先级，重置并复用任务

整个过程类似下图：

<img src="./fiber-and-fiberRoot/fiber.png" width="490" height="260"/>

以上的3点都要求整个调度的过程可拆分，可中断。新的`Fiber`树如下图

<img src="./fiber-and-fiberRoot/fiber_tree.png" width="650" height="500"/>

在新的架构中，`React`将整个树结构用链表来实现，每个节点都记录了跟它有关的关系信息，有了关系信息，就可以很轻易的通过某一个节点，复现整个树。自然满足了可拆分，可中断：

## FiberRoot
`FiberRoot`是整个`Fiber`树的根节点，所以`FiberRoot`上记录着整个`Fiber`树的调度信息，在`fiber reconciler`中，是支持同时多次`ReactDOM.render()`的，所以，此时会产生`N`个`FiberRoot`，出于同样的原因，它们之间也会形成一条链表型的关于`FiberRoot`的任务队列：

```            
               nextScheduledRoot            nextScheduledRoot            nextScheduledRoot
firstFiberRoot -----------------> FiberRoot -----------------> FiberRoot -----------------> lastFiberRoot
               <---------------------------------------------------------------------------
                                            nextScheduledRoot 
```

``` javaScript
class FiberRoot {
  containerInfo: Element  // 容器节点
  current: Fiber // 当前根节点的 fiber

  // 最老和最新的被挂起的任务的优先级
  earliestSuspendedTime: ExpirationTime = NoWork
  latestSuspendedTime: ExpirationTime = NoWork

  // 最老和最新的不确定是否挂起的任务的优先级
  earliestPendingTime: ExpirationTime = NoWork
  latestPendingTime: ExpirationTime = NoWork

  // 最新的通过一个promise被reslove并且可以重新尝试的优先级
  latestPingedTime: ExpirationTime = NoWork

  didError: boolean = false

  // 等待提交的优先级
  pendingCommitExpirationTime: ExpirationTime = NoWork

  // 完成render后的 fiber 树
  finishedWork: Fiber = null

  // 挂起任务的timeout 标志位
  timeoutHandle: number = noTimeout

  // 下一个 work 的优先级与当前优先级
  nextExpirationTimeToWorkOn: ExpirationTime = NoWork
  expirationTime: ExpirationTime = NoWork

  firstBatch: Batch = null

  nextScheduledRoot: FiberRoot = null

  constructor(containerInfo: Element, isConcurrent: boolean) {
    const mode = isConcurrent ? ConcurrentMode : NoContext // 区分异步还是同步

    this.current = new Fiber(HostRoot, null, null, mode)
    this.containerInfo = containerInfo
    this.current.stateNode = this
  }
}
```

### Fiber
`Fiber`是一个工作单元，由于一切的调度更新渲染都是围绕着它展开，在`fiber reconciler`下，操作是可以分成很多小部分，并且可以被中断的，所以同步操作`DOM`可能会导致`Fiber`树与实际`DOM`的不同步。对于每个节点，不光需要存储了对应元素节点的基本信息，还要保存一些用于任务调度的信息，以及跟周围节点的关系信息

``` javaScript
class Fiber {
  // 组件类型 如：function、class、hostComponent 等
  tag: WorkTag
  // ReactElment 里的 key
  key: null | string
  // ReactElement.type，也就是我们调用`createElement`的第一个参数
  elementType: any = null
  // 异步组件resolved之后返回的内容，一般是`function`或者`class`
  type: any = null
  // 自身特性，如：class就是当前 的组件对象，hostComponent 就是 dom 元素
  stateNode: any = null

  return: Fiber = null // 父节点
  child: Fiber = null // 子节点
  sibling: Fiber = null // 右边的兄弟节点
  index: number = 0 // 索引值

  ref: any = null

  pendingProps: any // 未处理的 props,可以理解为 new props
  memoizedProps: any = null // 当前节点的 props,可以理解为 old props

  updateQueue: UpdateQueue<any> = null // 当前节点的任务队列
  memoizedState: any = null // 当前节点的state

  contextDependencies: ContextDependencyList = null // context 队列

  mode: TypeOfMode // 工作类型， NoContext：同步渲染 ConcurrentMode：异步渲染

  effectTag: SideEffectTag = NoEffect // 标记当前节点的一些效果

  nextEffect: Fiber = null 
  firstEffect: Fiber = null
  lastEffect: Fiber = null

  expirationTime: ExpirationTime = NoWork // 优先级
  childExpirationTime: ExpirationTime = NoWork // 子优先级

  alternate: Fiber = null // 用于调度时的快照

  constructor(tag: WorkTag, pendingProps: any, key: string | null, mode: TypeOfMode) {
    this.tag = tag
    this.pendingProps = pendingProps
    this.key = key
    this.mode = mode
  }
}
```

### `workInProgress`
`WorkInProgress` 是`Fiber`进行调度时的一个副本，与`Fiber`通过`alternate`相互连接，调度完成后用整个`WorkInProgress`树替代当前的`Fiber`树

```javaScript
function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress: Fiber = current.alternate

  if (workInProgress === null) {
    const { tag, key, mode } = current
    workInProgress = new Fiber(tag, pendingProps, key, mode)

    workInProgress.elementType = current.elementType
    workInProgress.type = current.type
    workInProgress.stateNode = current.stateNode

    workInProgress.alternate = current
    current.alternate = workInProgress
  } else {
    // 如果有 alternate 了，把几个调度需要的属性初始化
    workInProgress.pendingProps = pendingProps

    workInProgress.effectTag = NoEffect
    workInProgress.nextEffect = null
    workInProgress.firstEffect = null
    workInProgress.lastEffect = null
  }

  workInProgress.childExpirationTime = current.childExpirationTime
  workInProgress.expirationTime = current.expirationTime

  workInProgress.child = current.child
  workInProgress.sibling = current.sibling

  workInProgress.index = current.index
  workInProgress.ref = current.ref

  workInProgress.memoizedProps = current.memoizedProps
  workInProgress.memoizedState = current.memoizedState
  workInProgress.updateQueue = current.updateQueue

  workInProgress.contextDependencies = current.contextDependencies

  return workInProgress
}
```
