/**
 * 4kvm.org 自动连续点击下一集 - 浏览器控制台脚本
 * 在 https://www.4kvm.org/seasons/saodfb 打开后，F12 控制台粘贴运行
 *
 * 用法：
 * 1. 打开 4kvm 剧集页
 * 2. F12 打开控制台
 * 3. 粘贴此脚本回车
 * 4. 自动从第1集开始连续点击到最后一集
 */

(function () {
  const SEL = '.jujiepisodios a';
  const INTERVAL_MS = 4000; // 每集间隔（等视频加载）

  function getEpisodes() {
    return Array.from(document.querySelectorAll(SEL));
  }

  function getActiveIndex() {
    const active = document.querySelector('.jujiepisodios a.active');
    if (!active) return -1;
    const nodes = getEpisodes();
    return nodes.indexOf(active);
  }

  function clickByIndex(i) {
    const nodes = getEpisodes();
    if (i < 0 || i >= nodes.length) return false;
    nodes[i].click();
    console.log('点击第 ' + (i + 1) + ' 集');
    return true;
  }

  function clickNext() {
    const nodes = getEpisodes();
    const idx = getActiveIndex();
    const nextIdx = idx < 0 ? 0 : idx + 1;
    if (nextIdx >= nodes.length) {
      console.log('已是最后一集');
      return false;
    }
    clickByIndex(nextIdx);
    return true;
  }

  /** 连续自动点击所有集数 */
  async function autoClickAll() {
    const nodes = getEpisodes();
    if (!nodes.length) {
      console.log('未找到集数，选择器: ' + SEL);
      return;
    }
    console.log('共 ' + nodes.length + ' 集，开始连续点击，间隔 ' + INTERVAL_MS + 'ms');
    for (let i = 0; i < nodes.length; i++) {
      clickByIndex(i);
      if (i < nodes.length - 1) {
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
      }
    }
    console.log('全部点击完成');
  }

  window._4kvmSniff = {
    clickNext,
    clickByIndex,
    getEpisodes: () => getEpisodes().map((el, i) => ({ index: i, text: el.innerText })),
    getActiveIndex,
    autoClickAll,
  };

  console.log('4kvm 嗅探助手已加载');
  console.log('  _4kvmSniff.autoClickAll()   - 连续点击所有集（自动执行）');
  console.log('  _4kvmSniff.clickNext()      - 手动点击下一集');
  console.log('  _4kvmSniff.clickByIndex(0)  - 点击第1集');

  // 自动开始连续点击
  autoClickAll();
})();
