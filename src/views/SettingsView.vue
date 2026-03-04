<template>
  <div class="settings-view">
    <h2>设置</h2>
    <p class="hint">按网站域名分别配置，不同网站可设置不同的请求头、Cookie、自定义参数</p>

    <section class="setting-section download-section">
      <h3>下载设置</h3>
      <p class="section-hint">以下设置同时应用于 yt-dlp 和 N_m3u8DL-RE</p>
      <div class="form-row">
        <label>下载线程数:</label>
        <input
          v-model.number="downloadThreads"
          type="number"
          min="0"
          placeholder="0 表示使用默认"
          @blur="saveDownloadSettings"
        />
        <span class="input-hint">0 为默认，建议 4–32</span>
      </div>
      <div class="form-row">
        <label>下载限速:</label>
        <input
          v-model="speedLimit"
          type="text"
          placeholder="如 4.2M 或 100K，留空不限速"
          @blur="saveDownloadSettings"
        />
        <span class="input-hint">yt-dlp 按字节/秒，N_m3u8DL-RE 按 Mbps/Kbps</span>
      </div>
      <div class="form-row">
        <label>同时下载数:</label>
        <input
          v-model.number="maxConcurrent"
          type="number"
          min="1"
          placeholder="1"
          @blur="saveDownloadSettings"
        />
        <span class="input-hint">同时进行的下载任务数量，建议 1–5</span>
      </div>
    </section>

    <section class="setting-section debug-section">
      <h3>调试</h3>
      <div class="form-row toggle-row">
        <label class="toggle-label">
          <input v-model="showOutput" type="checkbox" @change="onToggleOutput" />
          <span>显示解析/下载时的命令行输出</span>
        </label>
        <p class="toggle-hint">开启后可在下载页查看 yt-dlp 等命令的实时输出，便于排查卡死等问题</p>
      </div>
    </section>

    <section class="setting-section">
      <div class="section-header">
        <h3>嗅探规则</h3>
        <div class="header-actions">
          <button class="btn btn-sm btn-outline" @click="add4kvmSniffRule">+ 4kvm.org</button>
          <button class="btn btn-sm" @click="addSniffRule">+ 添加规则</button>
        </div>
      </div>
      <p class="section-hint">按域名配置嗅探参数，剧名、URL 过滤等默认值会显示在下载页</p>
      <div v-for="rule in settingsStore.sniffRules" :key="rule.id" class="site-card">
        <div class="site-header" @click="toggleSniffExpand(rule.domain)">
          <span class="domain">{{ rule.domain }}</span>
          <span class="expand-icon">{{ expandedSniff[rule.domain] ? '−' : '+' }}</span>
        </div>
        <div v-show="expandedSniff[rule.domain]" class="site-body">
          <div class="form-row">
            <label>域名:</label>
            <input v-model="rule.domain" type="text" placeholder="4kvm.org" @blur="saveSniffRule(rule)" />
          </div>
          <div class="form-row">
            <label>集数选择器:</label>
            <input v-model="rule.jsSelector" type="text" placeholder=".jujiepisodios a" @blur="settingsStore.save" />
          </div>
          <div class="form-row">
            <label>页面加载后脚本 (可选):</label>
            <textarea v-model="rule.actionScript" class="sniff-rules" rows="2" placeholder="等待、关广告等" @blur="settingsStore.save" />
          </div>
          <div class="form-row form-row-inline">
            <div class="inline-field">
              <label>最小等待 (ms):</label>
              <input v-model.number="rule.sniffMinWaitMs" type="number" min="0" @blur="saveSniffRule(rule)" />
            </div>
            <div class="inline-field">
              <label>最大等待 (ms):</label>
              <input v-model.number="rule.sniffMaxWaitMs" type="number" min="500" @blur="saveSniffRule(rule)" />
            </div>
          </div>
          <div class="form-row">
            <label>默认剧名 (选择器或手动):</label>
            <input v-model="rule.defaultSeriesName" type="text" placeholder="留空则下载页为空" @blur="settingsStore.save" />
          </div>
          <div class="form-row">
            <label>默认 URL 过滤:</label>
            <input v-model="rule.defaultUrlFilter" type="text" placeholder="如 regex:\.m3u8，留空显示全部" @blur="settingsStore.save" />
          </div>
          <div class="form-row">
            <label>URL 过滤规则 (每行一条):</label>
            <textarea
              :value="sniffFilterDraft[rule.domain] ?? sniffFilterText(rule)"
              class="sniff-rules"
              rows="2"
              placeholder=".m3u8"
              @input="sniffFilterDraft[rule.domain] = ($event.target as HTMLTextAreaElement).value"
              @blur="saveSniffFilterRules(rule)"
            />
          </div>
          <button class="btn btn-sm btn-danger" @click="removeSniffRule(rule.domain)">删除</button>
        </div>
      </div>
      <div v-if="addSniffModal" class="modal-overlay" @click.self="addSniffModal = false">
        <div class="modal">
          <h4>添加嗅探规则</h4>
          <input
            ref="addSniffInputRef"
            v-model="newSniffDomain"
            type="text"
            class="modal-input"
            placeholder="如 4kvm.org"
            @keydown.enter="confirmAddSniffRule"
          />
          <div class="modal-actions">
            <button class="btn btn-sm" @click="addSniffModal = false">取消</button>
            <button class="btn btn-sm btn-primary" @click="confirmAddSniffRule">确定</button>
          </div>
        </div>
      </div>
    </section>

    <section class="setting-section">
      <div class="section-header">
        <h3>脚本提取规则</h3>
        <div class="header-actions">
          <button class="btn btn-sm btn-outline" @click="add4kvmExtractRule">+ 4kvm.org</button>
          <button class="btn btn-sm btn-outline" @click="addZiziysExtractRule">+ ziziys.org</button>
          <button class="btn btn-sm" @click="addExtractScriptRule">+ 添加规则</button>
        </div>
      </div>
      <p class="section-hint">使用 Node.js 脚本批量获取视频链接，无需打开浏览器</p>
      <div v-for="rule in settingsStore.extractScriptRules" :key="rule.id" class="site-card">
        <div class="site-header" @click="toggleExtractExpand(rule.domain)">
          <span class="domain">{{ rule.name || rule.domain }}</span>
          <span class="expand-icon">{{ expandedExtract[rule.domain] ? '−' : '+' }}</span>
        </div>
        <div v-show="expandedExtract[rule.domain]" class="site-body">
          <div class="form-row">
            <label>域名:</label>
            <input v-model="rule.domain" type="text" placeholder="4kvm.org" @blur="saveExtractRule(rule)" />
          </div>
          <div class="form-row">
            <label>规则名称:</label>
            <input v-model="rule.name" type="text" placeholder="4kvm 提取" @blur="settingsStore.save" />
          </div>
          <div class="form-row">
            <label>脚本路径:</label>
            <div class="input-with-btn">
              <input v-model="rule.scriptPath" type="text" placeholder="scripts/4kvm-extract-links.js" @blur="settingsStore.save" />
              <button class="btn btn-sm" @click="selectExtractScript(rule)">选择</button>
            </div>
          </div>
          <div class="form-row">
            <label>默认剧名:</label>
            <input v-model="rule.defaultSeriesName" type="text" placeholder="留空则手动输入" @blur="settingsStore.save" />
          </div>
          <button class="btn btn-sm btn-danger" @click="removeExtractRule(rule.domain)">删除</button>
        </div>
      </div>
      <div v-if="addExtractModal" class="modal-overlay" @click.self="addExtractModal = false">
        <div class="modal">
          <h4>添加脚本提取规则</h4>
          <input
            ref="addExtractInputRef"
            v-model="newExtractDomain"
            type="text"
            class="modal-input"
            placeholder="如 4kvm.org"
            @keydown.enter="confirmAddExtractRule"
          />
          <div class="modal-actions">
            <button class="btn btn-sm" @click="addExtractModal = false">取消</button>
            <button class="btn btn-sm btn-primary" @click="confirmAddExtractRule">确定</button>
          </div>
        </div>
      </div>
    </section>

    <section class="setting-section">
      <div class="section-header">
        <h3>站点配置</h3>
        <button class="btn btn-sm" @click="addSite">+ 添加站点</button>
      </div>

      <div v-if="addSiteModal" class="modal-overlay" @click.self="addSiteModal = false">
        <div class="modal">
          <h4>添加站点</h4>
          <input
            ref="addSiteInputRef"
            v-model="newSiteDomain"
            type="text"
            class="modal-input"
            placeholder="如 bilibili.com"
            @keydown.enter="confirmAddSite"
          />
          <div class="modal-actions">
            <button class="btn btn-sm" @click="addSiteModal = false">取消</button>
            <button class="btn btn-sm btn-primary" @click="confirmAddSite">确定</button>
          </div>
        </div>
      </div>
      <div v-for="site in settingsStore.siteList" :key="site.domain" class="site-card">
        <div class="site-header" @click="toggleExpand(site.domain)">
          <span class="domain">{{ site.domain || '(未设置域名)' }}</span>
          <span class="expand-icon">{{ expanded[site.domain] ? '−' : '+' }}</span>
        </div>
        <div v-show="expanded[site.domain]" class="site-body">
          <div class="form-row">
            <label>域名 (如 bilibili.com):</label>
            <input v-model="site.domain" type="text" placeholder="bilibili.com" @blur="saveSite(site)" />
          </div>
          <div class="form-group">
            <h4>图片请求头</h4>
            <div class="form-row">
              <label>Referer:</label>
              <input v-model="site.imageHeaders.referer" type="text" placeholder="留空则从链接推断" @blur="settingsStore.save" />
            </div>
            <div class="form-row">
              <label>Origin:</label>
              <input v-model="site.imageHeaders.origin" type="text" placeholder="留空则从链接推断" @blur="settingsStore.save" />
            </div>
          </div>
          <div class="form-group">
            <h4>Cookie</h4>
            <div class="form-row">
              <label>方式:</label>
              <select v-model="site.cookie.type" @change="settingsStore.save">
                <option value="none">不使用</option>
                <option value="file">Cookie 文件</option>
                <option value="browser">从浏览器获取</option>
              </select>
            </div>
            <div v-if="site.cookie.type === 'file'" class="form-row">
              <label>文件路径:</label>
              <div class="input-with-btn">
                <input v-model="site.cookie.filePath" type="text" placeholder="Netscape 格式 cookie 文件路径" @blur="settingsStore.save" />
                <button class="btn btn-sm" @click="selectCookieFile(site)">选择</button>
              </div>
            </div>
            <div v-if="site.cookie.type === 'browser'" class="form-row">
              <label>浏览器:</label>
              <select v-model="site.cookie.browser" @change="settingsStore.save">
                <option value="chrome">Chrome</option>
                <option value="firefox">Firefox</option>
                <option value="safari">Safari</option>
                <option value="edge">Edge</option>
                <option value="brave">Brave</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <h4>yt-dlp 自定义参数</h4>
            <div class="form-row">
              <label>额外参数 (如 --js-runtimes node):</label>
              <input v-model="site.customParams" type="text" placeholder="YouTube 可填: --js-runtimes node" @blur="settingsStore.save" />
            </div>
          </div>
          <div class="form-group">
            <h4>N_m3u8DL-RE 自定义参数</h4>
            <div class="form-row">
              <label>额外参数 (如 -H &quot;Cookie: xxx&quot;):</label>
              <input v-model="site.customM3u8Params" type="text" placeholder="M3U8/HLS 下载时使用" @blur="settingsStore.save" />
            </div>
          </div>
          <button class="btn btn-sm btn-danger" @click="removeSite(site.domain)">删除此站点</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useSettingsStore } from '@/stores/settings-store'
import type { SiteConfig, SniffRule, ExtractScriptRule } from '@/stores/settings-store'

const settingsStore = useSettingsStore()
const expanded = ref<Record<string, boolean>>({})
const expandedSniff = ref<Record<string, boolean>>({})
const expandedExtract = ref<Record<string, boolean>>({})
const showOutput = ref(settingsStore.showParseDownloadOutput)
const downloadThreads = ref(settingsStore.downloadSettings.downloadThreads)
const speedLimit = ref(settingsStore.downloadSettings.speedLimit)
const maxConcurrent = ref(settingsStore.downloadSettings.maxConcurrent)

function saveDownloadSettings() {
  const threads = Number(downloadThreads.value)
  const normalized = Number.isFinite(threads) && threads >= 0 ? threads : 0
  const concurrent = Number(maxConcurrent.value)
  const concurrentNorm = Number.isFinite(concurrent) && concurrent >= 1 ? Math.floor(concurrent) : 1
  settingsStore.setDownloadSettings({
    downloadThreads: normalized,
    speedLimit: speedLimit.value.trim(),
    maxConcurrent: concurrentNorm,
  })
  downloadThreads.value = normalized
  maxConcurrent.value = concurrentNorm
  window.electronAPI?.setDownloadSettings?.({ maxConcurrent: concurrentNorm })
}

function onToggleOutput() {
  settingsStore.setShowParseDownloadOutput(showOutput.value)
  window.electronAPI?.setDebugOutputEnabled?.(showOutput.value)
}
const addSiteModal = ref(false)
const newSiteDomain = ref('')
const addSiteInputRef = ref<HTMLInputElement | null>(null)
const addSniffModal = ref(false)
const newSniffDomain = ref('')
const addSniffInputRef = ref<HTMLInputElement | null>(null)
const sniffFilterDraft = ref<Record<string, string>>({})
const addExtractModal = ref(false)
const newExtractDomain = ref('')
const addExtractInputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  settingsStore.load()
  showOutput.value = settingsStore.showParseDownloadOutput
  downloadThreads.value = settingsStore.downloadSettings.downloadThreads
  speedLimit.value = settingsStore.downloadSettings.speedLimit
  maxConcurrent.value = settingsStore.downloadSettings.maxConcurrent
  window.electronAPI?.setDebugOutputEnabled?.(settingsStore.showParseDownloadOutput)
  window.electronAPI?.setDownloadSettings?.({ maxConcurrent: settingsStore.downloadSettings.maxConcurrent })
  settingsStore.siteList.forEach((s) => { expanded.value[s.domain] = true })
  settingsStore.sniffRules.forEach((r) => { expandedSniff.value[r.domain] = true })
  settingsStore.extractScriptRules.forEach((r) => { expandedExtract.value[r.domain] = true })
})

function toggleExpand(domain: string) {
  expanded.value[domain] = !expanded.value[domain]
}

function addSite() {
  newSiteDomain.value = ''
  addSiteModal.value = true
  nextTick(() => addSiteInputRef.value?.focus())
}

function confirmAddSite() {
  const domain = newSiteDomain.value.trim().replace(/^www\./, '')
  if (!domain) return
  settingsStore.getOrCreateSiteConfig(domain)
  expanded.value[domain] = true
  settingsStore.save()
  addSiteModal.value = false
}

function add4kvmSniffRule() {
  const domain = '4kvm.org'
  settingsStore.addSniffRule({
    domain,
    jsSelector: '.jujiepisodios a',
    sniffMinWaitMs: 800,
    sniffMaxWaitMs: 12000,
    defaultUrlFilter: 'regex:\\.m3u8',
    filterRules: [{ pattern: '\\.m3u8', isRegex: true, enabled: true }, { pattern: '\\.mp4', isRegex: true, enabled: true }],
  })
  expandedSniff.value[domain] = true
}

function addSniffRule() {
  newSniffDomain.value = ''
  addSniffModal.value = true
  nextTick(() => addSniffInputRef.value?.focus())
}

function confirmAddSniffRule() {
  const domain = newSniffDomain.value.trim().replace(/^www\./, '')
  if (!domain) return
  settingsStore.addSniffRule({ domain })
  expandedSniff.value[domain] = true
  addSniffModal.value = false
}

function toggleSniffExpand(domain: string) {
  expandedSniff.value[domain] = !expandedSniff.value[domain]
}

function saveSniffRule(rule: SniffRule) {
  if (!rule.domain.trim()) return
  const min = Number(rule.sniffMinWaitMs)
  const max = Number(rule.sniffMaxWaitMs)
  rule.sniffMinWaitMs = Number.isFinite(min) && min >= 0 ? min : 500
  rule.sniffMaxWaitMs = Number.isFinite(max) && max >= 500 ? max : 8000
  settingsStore.addSniffRule(rule)
}

function removeSniffRule(domain: string) {
  settingsStore.removeSniffRule(domain)
}

function add4kvmExtractRule() {
  const domain = '4kvm.org'
  settingsStore.addExtractScriptRule({
    domain,
    name: '4kvm 脚本提取',
    scriptPath: 'scripts/4kvm-extract-links.js',
    defaultSeriesName: '',
  })
  expandedExtract.value[domain] = true
}

function addZiziysExtractRule() {
  const domain = 'ziziys.org'
  settingsStore.addExtractScriptRule({
    domain,
    name: 'ziziys 脚本提取',
    scriptPath: 'scripts/ziziys-extract-links.js',
    defaultSeriesName: '',
  })
  expandedExtract.value[domain] = true
}

function addExtractScriptRule() {
  newExtractDomain.value = ''
  addExtractModal.value = true
  nextTick(() => addExtractInputRef.value?.focus())
}

function confirmAddExtractRule() {
  const domain = newExtractDomain.value.trim().replace(/^www\./, '')
  if (!domain) return
  settingsStore.addExtractScriptRule({ domain })
  expandedExtract.value[domain] = true
  addExtractModal.value = false
}

function toggleExtractExpand(domain: string) {
  expandedExtract.value[domain] = !expandedExtract.value[domain]
}

function saveExtractRule(rule: ExtractScriptRule) {
  if (!rule.domain.trim()) return
  settingsStore.addExtractScriptRule(rule)
}

function removeExtractRule(domain: string) {
  settingsStore.removeExtractScriptRule(domain)
}

async function selectExtractScript(rule: ExtractScriptRule) {
  const path = await window.electronAPI?.selectScriptFile?.()
  if (path) {
    rule.scriptPath = path
    settingsStore.save()
  }
}

function sniffFilterText(rule: SniffRule): string {
  return (rule.filterRules || []).map((r) => (r.isRegex ? `regex:${r.pattern}` : r.pattern)).join('\n')
}

function saveSniffFilterRules(rule: SniffRule) {
  const draft = sniffFilterDraft.value
  const text = draft[rule.domain]?.trim() ?? ''
  const next = { ...draft }
  delete next[rule.domain]
  sniffFilterDraft.value = next
  const rules = text.split('\n').filter(Boolean).map((line: string) => {
    const isRegex = line.startsWith('regex:')
    const pattern = isRegex ? line.slice(6) : line
    return { pattern, enabled: true, isRegex }
  })
  rule.filterRules = rules.length ? rules : [{ pattern: '\\.m3u8', isRegex: true, enabled: true }]
  settingsStore.save()
}

function saveSite(site: SiteConfig) {
  if (!site.domain.trim()) return
  const oldKey = Object.keys(settingsStore.siteConfigs).find((k) => settingsStore.siteConfigs[k] === site)
  if (oldKey && oldKey !== site.domain) {
    delete settingsStore.siteConfigs[oldKey]
  }
  settingsStore.siteConfigs[site.domain] = site
  settingsStore.save()
}

function removeSite(domain: string) {
  delete settingsStore.siteConfigs[domain]
  settingsStore.save()
}

async function selectCookieFile(site: SiteConfig) {
  const path = await window.electronAPI?.selectFile?.()
  if (path) {
    if (!site.cookie) site.cookie = { type: 'file' }
    site.cookie.filePath = path
    settingsStore.save()
  }
}
</script>

<style scoped>
.settings-view h2 { margin: 0 0 8px 0; font-size: 1.25rem; }
.hint {
  margin: 0 0 24px 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.setting-section {
  background: var(--bg-card);
  padding: 24px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.header-actions {
  display: flex;
  gap: 8px;
}
.btn-outline {
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.form-row-inline {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.inline-field {
  flex: 1;
  min-width: 140px;
}
.inline-field label { display: block; margin-bottom: 4px; }
.inline-field input { max-width: 120px; }
.setting-section h3 { margin: 0; font-size: 1rem; }
.site-card {
  margin-bottom: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-secondary);
  cursor: pointer;
}
.site-header:hover { background: var(--bg-hover); }
.domain { font-weight: 500; }
.expand-icon { font-size: 1.2rem; color: var(--text-muted); }
.site-body { padding: 16px; }
.form-group {
  margin-bottom: 20px;
}
.form-group h4 {
  margin: 0 0 12px 0;
  font-size: 0.9rem;
  color: var(--text-secondary);
}
.form-row {
  margin-bottom: 12px;
}
.form-row label {
  display: block;
  font-size: 0.85rem;
  margin-bottom: 4px;
  color: var(--text-secondary);
}
.form-row input,
.form-row select {
  width: 100%;
  max-width: 500px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
}
.input-with-btn {
  display: flex;
  gap: 8px;
  max-width: 500px;
}
.input-with-btn input { flex: 1; }
.sniff-rules {
  width: 100%;
  max-width: 500px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: monospace;
  font-size: 0.85rem;
  resize: vertical;
}
.btn-sm {
  padding: 6px 12px;
  font-size: 0.85rem;
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 6px;
}
.btn-sm:hover { background: var(--bg-hover); }
.btn-danger { color: var(--danger); margin-top: 8px; }
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: var(--bg-card);
  padding: 24px;
  border-radius: var(--radius);
  min-width: 320px;
}
.modal h4 { margin: 0 0 16px 0; }
.modal-input {
  width: 100%;
  padding: 10px 14px;
  margin-bottom: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
}
.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.btn-primary { background: var(--accent); color: #0a0a0f; }
.download-section,
.debug-section {
  margin-bottom: 24px;
}
.section-hint {
  margin: -8px 0 12px 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.input-hint {
  display: block;
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.toggle-row { margin-bottom: 0; }
.toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 500;
}
.toggle-label input { width: auto; }
.toggle-hint {
  margin: 8px 0 0 24px;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
