# 源码解析十八 事件系统

### 特点
`React`在原生事件基础上自己实现了一套高效的事件系统，它有很多特点：

- 将所有声明的事件挂载在根节点上，避免了在各个`DOM`上频繁绑定卸载事件，减少了内存开销
- 整一套都在`react`的体系之下，与`fiber reconciler`相结合，简化了事件逻辑
- 通过合成事件对象，抹平了浏览器的兼容性
- 使用对象池来管理合成事件对象的创建和销毁，减少了垃圾生成和新对象内存的分配，大大提高了性能

### 实现
整个事件系统是基于动态注入插件到中心，基于中心分发来实现的。以下是官方源码中整个系统的轮廓图，将不同功能的插件注入到`EventPluginHub`，通过`ReactEventListener`和`ReactEventEmitter`注册原生事件，在`application`中获取相应事件具体的处理逻辑，事件触发时`EventPluginHub`将拿到的原生事件信息经过各个插件做加工，合成事件对象，传入`application`具体的事件逻辑并调用：

```javaScript
 * Overview of React and the event system:
 *
 * +------------+    .
 * |    DOM     |    .
 * +------------+    .
 *       |           .
 *       v           .
 * +------------+    .
 * | ReactEvent |    .
 * |  Listener  |    .
 * +------------+    .                         +-----------+
 *       |           .               +--------+|SimpleEvent|
 *       |           .               |         |Plugin     |
 * +-----|------+    .               v         +-----------+
 * |     |      |    .    +--------------+                    +------------+
 * |     +-----------.--->|EventPluginHub|                    |    Event   |
 * |            |    .    |              |     +-----------+  | Propagators|
 * | ReactEvent |    .    |              |     |TapEvent   |  |------------|
 * |  Emitter   |    .    |              |<---+|Plugin     |  |other plugin|
 * |            |    .    |              |     +-----------+  |  utilities |
 * |     +-----------.--->|              |                    +------------+
 * |     |      |    .    +--------------+
 * +-----|------+    .                ^        +-----------+
 *       |           .                |        |Enter/Leave|
 *       +           .                +-------+|Plugin     |
 * +-------------+   .                         +-----------+
 * | application |   .
 * |-------------|   .
 * |             |   .
 * |             |   .
 * +-------------+   .
 *                   .
 *    React Core     .  General Purpose Event Plugin System
 */
```