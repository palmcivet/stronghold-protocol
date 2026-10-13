本文是把 Spine 运行时代码移出主包的实施计划。规则与理由见 ARCH.md。

## 目标

- 主包（`mission-core`、`mission-renderer`、`assets-catalog`、`assets-extractor`、`app/*`、`deployment`）不含 Spine 运行时代码，不依赖 `@pixi/*`、`@pixi-spine/*`。
- Spine 后端作为客户端本地模组在 `examples/extensions/skeleton-spine/` 孵化，自带许可证声明，是 Spine 运行时代码在仓库中唯一的位置；是否提交由用户决定。日后可迁到独立仓库。

## 移出

移到 `examples/extensions/skeleton-spine/`：

- `mission-renderer/actor/skeleton/index.ts`：Spine 3.8 运行时实现与 `createMissionSkeletonLoader`。
- `mission-renderer/actor/skeleton/mesh.ts`：Three 网格适配。按 Spine 的附件、裁剪与混合模式顺序组织，只有 Spine 后端使用。
- 以上两个文件的同目录测试。
- `assets-extractor/spine/skel.ts`：用运行时读 `.skel` 的部分，改为提取器插件。
- `mission-renderer` 与 `assets-extractor` 的 `@pixi/*`、`@pixi-spine/*` 依赖与锁文件条目。
- `mission-renderer/index.ts` 对 Spine 实现的再导出。
- `NOTICE.md` 的「Spine Runtimes」一节，移入模组目录的许可证声明。

## 留下

- 骨骼端口（`port/skeleton.ts`，按下文重设计）。
- `assets-catalog` 的 `spine` 种类、`SpineMeta`、`spineSource`、`isSpineSource`、`createSpineCache` 与 `spineDataWeight`：只是文件角色、元数据与缓存，不引用运行时。
- atlas 解析统一到 `assets-catalog`：合并 `mission-renderer/actor/skeleton/atlas.ts` 与 `assets-extractor/spine/atlas.ts` 为一份（解析、页与区域、规范化），提取器与 Spine 后端都用它，两处旧文件删除。
- `assets-extractor/spine/model.ts`：`SpineMeta` 组装是格式知识，改为在插件缺席时写缺省字段。
- `app/data` 的动画角色表：侧车缺时长时按动画名归类，时长缺省。

待办：评估把仍带 Spine 形状的公开接口改成格式中立，只在影响后端接入时改：

- `MissionAppearance.spine` → 骨骼资源键字段（如 `skeleton`）。
- `MissionAssetKind` 的 `'spine'`、资源端口的 `spine()` 与 `SpineSource` 参数。
- `assets-catalog` 中 `spineDataWeight` 是否改由后端提供权重函数。

开发中发现、留待拆分时处理的：

- `app/client` 开发服务器的依赖预构建经 `mission-renderer` 入口的再导出带上 `@pixi-spine/runtime-3.8`（约 0.9 MB），生产包经摇树不含 Pixi。拆分前不排除，入口再导出移走后自然消失。

## 端口重设计

- 后端：`MissionSkeletonBackend { format, load(source), create(data), dispose(data) }`，`format` 是命名空间格式 id（如 `spine-3.8`）。
- 注册：`createMissionSkeletonTable()`，`register`、`replace`、`seal`，经 `MissionStageOptions` 传入，创建舞台时封存，与特效表同一套密封注册表。
- 来源：`MissionSkeletonSource` 改为按角色分的文件 `{ format, files: { [role]: Uint8Array | string }, pages: { [name]: Texture } }`，角色取自资源目录（`skel`、`atlas`、`page`、`meta`）；格式 id 取自资源目录条目新增的显式 `format` 字段（如 `spine-3.8`），由提取器写入，不从 `spineVersion` 推断。
- 加载：通用加载器按角色取文件，按 `assets-catalog` 的 atlas 解析结果匹配页贴图，再交给后端。
- 回退：格式没有后端或加载失败时，演员使用替身，报告一次未支持的格式，不抛错。

## 测试

- `test/dependency.spec.ts`：规则改为任何主包源码都不引用 `@pixi/*`、`@pixi-spine/*`、`@esotericsoftware/*`；另加两条扫描：各主包源码不引用 `examples/extensions/` 下的任何包，各主包 `package.json` 不依赖这些包。
- 演员测试用假后端；新增无后端时退回替身的用例。
- `assets-extractor`：无插件时 `SpineMeta` 缺省字段的用例；有插件时沿用 `test/spine-model.spec.ts`，移到模组目录。

## 模组目录

```text
examples/extensions/skeleton-spine/
  LICENSE.md        Spine Runtimes License 全文与本模组的许可说明
  package.json      依赖 @pixi-spine/*；对 mission-renderer、assets-catalog、assets-extractor 只用公开接口
  renderer/         格式 id spine-3.8 的骨骼后端（原 actor/skeleton/）
  extractor/        提取器插件：读 .skel 补全 SpineMeta
  manifest          客户端本地模组清单（scope local，格式见 APP.md）
```

- `examples/extensions/*` 加入 `pnpm-workspace`，以便用工作区依赖引用主包的公开接口；反方向的依赖由上述扫描禁止。
- `app/client` 开发期把它当本地模组加载，接线见 APP.md。

## 验收

- 主包的构建、`pnpm test`、`tsc --noEmit` 通过，源码与锁文件中没有 Spine 运行时与 Pixi。
- 黄金摘要不变。
- 不装后端时舞台正常运行，所有演员显示替身。
- 装上 `skeleton-spine` 后，骨骼画面、动画事件与包围盒与移出前一致（演员录制用例与截图对比）。
- 装上插件后提取出的 `SpineMeta` 与移出前逐字节一致。
