import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: () => import('@/views/DownloadView.vue'), meta: { title: '下载' } },
    { path: '/queue', component: () => import('@/views/QueueView.vue'), meta: { title: '下载队列' } },
    { path: '/history', component: () => import('@/views/HistoryView.vue'), meta: { title: '历史记录' } },
    { path: '/settings', component: () => import('@/views/SettingsView.vue'), meta: { title: '设置' } },
  ],
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '下载'} - 视频下载器`
})

export default router
