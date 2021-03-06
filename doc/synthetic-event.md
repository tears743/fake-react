# 源码解析二十 事件对象`SyntheticEvent`及事件池
前面提到过，`react`自己合成了事件对象，那么它是怎么做的呢？

### `SyntheticEvent`
`SyntheticEvent`是整个`event`类的抽象基类，其余的具体`event`类都继承这个类实现。所以先看下基类的代码，它抽象了生成整个`event`所需属性的过程。在构造函数中遍历静态的`Interface`，拿到`nativeEvent`里这些属性真实的值，注入到实例上：

```javaScript
class SyntheticEvent {
  static Interface = {
    type: null,
    target: null,
    currentTarget() {
      return null
    },
    eventPhase: null,
    bubbles: null,
    cancelable: null,
    timeStamp(event: any) {
      return event.timeStamp || Date.now()
    },
    defaultPrevented: null,
    isTrusted: null,
  }

    init(dispatchConfig: DispatchConfig, targetInst: Fiber, nativeEvent: Event, nativeEventTarget: EventTarget) {
    this.dispatchConfig = dispatchConfig
    this.nativeEvent = nativeEvent
    this._targetInst = targetInst

    const { Interface } = this.constructor as any
    Object.keys(Interface).forEach((propName) => {
      const normalize = Interface[propName]

      if (normalize) {
        this[propName] = normalize(nativeEvent)
      } else if (propName === 'target') {
        this.target = nativeEventTarget
      } else {
        this[propName] = nativeEvent[propName]
      }
    })

    const defaultPrevented = (nativeEvent as any).defaultPrevented != null ? (nativeEvent as any).defaultPrevented : (nativeEvent as any).returnValue === false
    if (defaultPrevented) {
      this.isDefaultPrevented = functionThatReturnsTrue
    } else {
      this.isDefaultPrevented = functionThatReturnsFalse
    }
    this.isPropagationStopped = functionThatReturnsFalse
  }
  ...
}
```

在看看具体的`event`子类实现，这里拿`focusEvent`举例，由于在`SyntheticEvent`中已经抽象出了整个对象的属性注入工作，所以子类只要在父类`Interface`的基础上加上当前类需要的属性就好

```javaScript
class SyntheticFocusEvent extends SyntheticEvent {
  static Interface = {
    ...SyntheticUiEvent.Interface,
    relatedTarget: null,
  }
}
```

### 对象池

在创建`event`对象时，`react`采用了对象池的概念，每个 `event`在继承完后,都会通过`addPool()`给其加上对象池

```javaScript
export function addPool(Event: any): StaticSyntheticEvent {
  Event.eventPool = [] // 对象池存储数组

  Event.getPooled = function(dispatchConfig: DispatchConfig, targetInst: Fiber, nativeEvent: Event, nativeEventTarget: EventTarget) {
    ...
  }

  Event.release = function(event: SyntheticEvent) {
    ...
  }

  return Event
}

export default addPool(SyntheticFocusEvent)
```

在创建`event`对象时，会调用`release()`将其塞入对象池数组中

```javaScript
  Event.release = function(event: SyntheticEvent) {
    event.destructor()

    if (this.eventPool.length < EVENT_POOL_SIZE) {
      this.eventPool.push(event)
    }
  }
```

在读取`event`对象时，会调用`getPooled()`，若对象池中还有对象，可以直接取出来复用，减少了垃圾生成和新对象内存的分配，大大提高了性能

```javaScript
  Event.release = function(event: SyntheticEvent) {
    event.destructor()

    if (this.eventPool.length < EVENT_POOL_SIZE) {
      this.eventPool.push(event)
    }
  }
```

