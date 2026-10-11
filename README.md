<h1>卫戍协议：盟约 · Stronghold Protocol: Alliance</h1>

- [开发](#开发)
- [致谢](#致谢)
- [贡献](#贡献)

《明日方舟》自走棋塔防玩法「卫戍协议：盟约」的复刻：浏览器即开即玩，单人或 1–4 人联机合作。本仓库是 [Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol) 的修改版本

> [!IMPORTANT]
> - 本项目是玩家自制的**非官方同人作品**，与上海鹰角网络科技有限公司（Hypergryph）、Yostar 及其关联方**没有任何关系**，未获其授权或认可。
> - 《明日方舟》及「卫戍协议」的名称、角色、美术、音乐、音效、文本与数据，版权归原权利人。本仓库不包含这些作品，也不就它们授予任何权利。
> - 权利人如认为本项目侵犯其权益，请通过 Issue 联系，相关内容会删除。
> - 程序按「现状」提供，**不提供任何担保**，使用风险自负。

版权范围、担保与各部分许可证见 [NOTICE.md](NOTICE.md)，程序许可证全文见 [LICENSE.md](LICENSE.md)。

## 开发

需要 Node.js 20。

```bash
pnpm install
pnpm test
```

## 致谢

- 游戏数据：
   - [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData)
- 素材来源：
   - [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource)
   - [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource)
   - [isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models)
   - [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2)
   - 字体来自 [TimWangZi/The-font-of-Arknights](https://github.com/TimWangZi/The-font-of-Arknights) 与 Google Fonts（Noto Sans SC）
- 规则核对：
   - [PRTS 明日方舟中文 Wiki](https://prts.wiki/)
- LZ4AK 解包：
   - `aklz4.py` 来自 [isHarryh/Ark-Unpacker](https://github.com/isHarryh/Ark-Unpacker)（BSD-3-Clause，经 MooncellWiki/UnityPy）
   - 解析 Unity 资源使用 [UnityPy](https://github.com/K0lb3/UnityPy)（MIT）

感谢以上项目的作者与维护者，感谢鹰角网络带来这款游戏。

## 贡献

欢迎提 Issue 反馈 Bug、与官方规则不一致的地方或改进建议，也欢迎提交 Pull Request。

- 代码规范见 [Code of Conduct](.github/CODE_OF_CONDUCT.md)
- 代码将以 GPL-3.0-or-later 发布
- 禁止提交任何游戏素材文件
- 本项目坚持非商业：禁止提交广告、付费、打赏等任何形式的变现功能
