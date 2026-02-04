import { useEffect, useState } from 'react'
import { api, Broadcast, AttachmentData, InlineButton } from '../lib/api'
import MediaButtonsEditor from './MediaButtonsEditor'

const formatDate = (date?: string | null) => {
  if (!date) return ''
  return new Date(date).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
    case 'in_progress':
      return 'bg-ocean-500/15 text-ocean-300 border-ocean-400/30'
    case 'queued':
      return 'bg-gold-500/15 text-gold-300 border-gold-400/30'
    case 'failed':
      return 'bg-rose-500/15 text-rose-300 border-rose-400/30'
    default:
      return 'bg-white/10 text-white/50 border-white/10'
  }
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    completed: 'Завершена',
    in_progress: 'В процессе',
    queued: 'В очереди',
    failed: 'Ошибка'
  }
  return labels[status] || status
}

const getTargetStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    all: 'Все пользователи',
    new: 'Новые',
    active: 'Активные',
    closed: 'Закрытые'
  }
  return labels[status] || status
}

const getTargetStatusIcon = (status: string) => {
  switch (status) {
    case 'all':
      return '👥'
    case 'new':
      return '🆕'
    case 'active':
      return '✅'
    case 'closed':
      return '🔒'
    default:
      return '👤'
  }
}

export default function BroadcastPanel() {
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<AttachmentData[]>([])
  const [inlineButtons, setInlineButtons] = useState<InlineButton[][]>([])
  const [targetStatuses, setTargetStatuses] = useState<Set<'all' | 'new' | 'active' | 'closed'>>(new Set(['all']))
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [successToast, setSuccessToast] = useState(false)
  const [composeOpen, setComposeOpen] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const toggleTargetStatus = (status: 'all' | 'new' | 'active' | 'closed') => {
    const newSet = new Set(targetStatuses)
    if (status === 'all') {
      // If selecting 'all', clear others
      setTargetStatuses(new Set(['all']))
    } else {
      // Remove 'all' if present
      newSet.delete('all')
      if (newSet.has(status)) {
        newSet.delete(status)
        // If nothing selected, select 'all'
        if (newSet.size === 0) {
          setTargetStatuses(new Set(['all']))
          return
        }
      } else {
        newSet.add(status)
      }
      setTargetStatuses(newSet)
    }
  }

  useEffect(() => {
    fetchBroadcasts()
    const interval = setInterval(fetchBroadcasts, 5000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!successToast) return
    const timeout = setTimeout(() => setSuccessToast(false), 3000)
    return () => clearTimeout(timeout)
  }, [successToast])

  const fetchBroadcasts = async () => {
    try {
      const data = await api.listBroadcasts()
      setBroadcasts(data)
    } catch (error) {
      console.error('Failed to fetch broadcasts:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleSend = async () => {
    if (!body.trim()) return
    setSending(true)
    try {
      await api.createBroadcast({ 
        body,
        target_statuses: Array.from(targetStatuses),
        attachments: attachments.length > 0 ? attachments : null,
        inline_buttons: inlineButtons.length > 0 ? inlineButtons : null,
      })
      setBody('')
      setAttachments([])
      setInlineButtons([])
      setTargetStatuses(new Set(['all']))
      setShowAdvanced(false)
      setSuccessToast(true)
      await fetchBroadcasts()
    } catch (error) {
      console.error('Failed to send broadcast:', error)
    } finally {
      setSending(false)
    }
  }

  const totalSent = broadcasts.reduce((sum, b) => sum + (b.stats?.sent || 0), 0)
  const totalFailed = broadcasts.reduce((sum, b) => sum + (b.stats?.failed || 0), 0)

  const hasMedia = (b: Broadcast) => (b.attachments?.length || 0) > 0
  const hasButtons = (b: Broadcast) => (b.inline_buttons?.length || 0) > 0

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-display font-semibold text-white">Рассылка</h1>
          <p className="text-sm text-white/50 mt-1">Массовая отправка сообщений пользователям бота</p>
        </div>

        {successToast && (
          <div className="fixed top-20 right-6 z-50 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-lg backdrop-blur-sm">
            ✓ Рассылка поставлена в очередь
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-ocean-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">{broadcasts.length}</div>
                <div className="text-xs text-white/50">Всего рассылок</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">{totalSent.toLocaleString()}</div>
                <div className="text-xs text-white/50">Доставлено</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">{totalFailed.toLocaleString()}</div>
                <div className="text-xs text-white/50">Не доставлено</div>
              </div>
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* New Broadcast Card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden overflow-x-hidden">
            <button
              onClick={() => setComposeOpen(!composeOpen)}
              className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-ocean-500/20 to-ocean-600/10 flex items-center justify-center">
                  <svg className="h-5 w-5 text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">Новая рассылка</div>
                  <div className="text-xs text-white/50">Отправка всем пользователям</div>
                </div>
              </div>
              <svg
                className={`h-5 w-5 text-white/40 transition-transform ${composeOpen ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {composeOpen && (
              <div className="px-4 sm:px-5 pb-5 border-t border-white/5 max-h-[500px] overflow-y-auto overflow-x-hidden scrollbar-thin">
                <div className="mt-4">
                  <label className="block text-xs text-white/50 mb-2">Текст сообщения</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder="Введите текст рассылки..."
                    className="w-full rounded-2xl bg-ink-800/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50 resize-none"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                    <span>HTML:</span>
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">&lt;b&gt;&lt;/b&gt;</code>
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">&lt;i&gt;&lt;/i&gt;</code>
                    <code className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">&lt;code&gt;&lt;/code&gt;</code>
                  </div>

                  {/* Target Audience Selector - Beautiful Multi-select */}
                  <div className="mt-4">
                    <label className="block text-xs text-white/50 mb-3">Целевая аудитория</label>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                      <div className="grid grid-cols-2 gap-2">
                        {/* All Users - Special button */}
                        <button
                          type="button"
                          onClick={() => toggleTargetStatus('all')}
                          className={`col-span-2 relative flex items-center gap-3 rounded-xl border p-3 transition-all ${
                            targetStatuses.has('all')
                              ? 'border-ocean-500/50 bg-gradient-to-r from-ocean-500/15 to-ocean-600/10'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                          }`}
                        >
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${
                            targetStatuses.has('all') ? 'bg-ocean-500/20' : 'bg-white/5'
                          }`}>
                            <span className="text-xl">👥</span>
                          </div>
                          <div className="text-left flex-1">
                            <div className={`font-medium transition-colors ${targetStatuses.has('all') ? 'text-ocean-300' : 'text-white/70'}`}>
                              Все пользователи
                            </div>
                            <div className="text-[11px] text-white/40">Отправить всем без исключения</div>
                          </div>
                          {targetStatuses.has('all') && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                              <svg className="h-5 w-5 text-ocean-400" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>

                        <div className="col-span-2 flex items-center gap-2 my-1">
                          <div className="flex-1 h-px bg-white/10"></div>
                          <span className="text-[10px] text-white/30 uppercase tracking-wide">или выборочно</span>
                          <div className="flex-1 h-px bg-white/10"></div>
                        </div>

                        {/* New Users */}
                        <button
                          type="button"
                          onClick={() => toggleTargetStatus('new')}
                          className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 transition-all ${
                            targetStatuses.has('new')
                              ? 'border-gold-500/50 bg-gradient-to-r from-gold-500/15 to-gold-600/10'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                          }`}
                        >
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${
                            targetStatuses.has('new') ? 'bg-gold-500/20' : 'bg-white/5'
                          }`}>
                            <span className="text-base">🆕</span>
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate transition-colors ${targetStatuses.has('new') ? 'text-gold-300' : 'text-white/70'}`}>
                              Новые
                            </div>
                          </div>
                          {targetStatuses.has('new') && (
                            <svg className="h-4 w-4 text-gold-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>

                        {/* Active Users */}
                        <button
                          type="button"
                          onClick={() => toggleTargetStatus('active')}
                          className={`relative flex items-center gap-2.5 rounded-xl border p-2.5 transition-all ${
                            targetStatuses.has('active')
                              ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-500/15 to-emerald-600/10'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                          }`}
                        >
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${
                            targetStatuses.has('active') ? 'bg-emerald-500/20' : 'bg-white/5'
                          }`}>
                            <span className="text-base">✅</span>
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate transition-colors ${targetStatuses.has('active') ? 'text-emerald-300' : 'text-white/70'}`}>
                              Активные
                            </div>
                          </div>
                          {targetStatuses.has('active') && (
                            <svg className="h-4 w-4 text-emerald-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>

                        {/* Closed Users */}
                        <button
                          type="button"
                          onClick={() => toggleTargetStatus('closed')}
                          className={`col-span-2 relative flex items-center gap-2.5 rounded-xl border p-2.5 transition-all ${
                            targetStatuses.has('closed')
                              ? 'border-white/30 bg-gradient-to-r from-white/10 to-white/5'
                              : 'border-white/10 bg-white/[0.02] hover:bg-white/5'
                          }`}
                        >
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center transition-all ${
                            targetStatuses.has('closed') ? 'bg-white/15' : 'bg-white/5'
                          }`}>
                            <span className="text-base">🔒</span>
                          </div>
                          <div className="text-left flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate transition-colors ${targetStatuses.has('closed') ? 'text-white/90' : 'text-white/70'}`}>
                              Закрытые диалоги
                            </div>
                          </div>
                          {targetStatuses.has('closed') && (
                            <svg className="h-4 w-4 text-white/70 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </button>
                      </div>
                      
                      {/* Selection summary */}
                      {!targetStatuses.has('all') && targetStatuses.size > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                          <div className="text-[11px] text-white/40">
                            Выбрано: {Array.from(targetStatuses).map(s => getTargetStatusLabel(s)).join(', ')}
                          </div>
                          <button
                            type="button"
                            onClick={() => setTargetStatuses(new Set(['all']))}
                            className="text-[11px] text-ocean-400 hover:text-ocean-300"
                          >
                            Сбросить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Advanced Section Toggle */}
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm hover:bg-white/5 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-gold-500/20 to-gold-600/10 flex items-center justify-center">
                        <svg className="h-4 w-4 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <div className="text-white/80">Медиа и кнопки</div>
                        <div className="text-xs text-white/40">
                          {attachments.length > 0 || inlineButtons.length > 0
                            ? `${attachments.length} файлов, ${inlineButtons.flat().length} кнопок`
                            : 'Добавить вложения и inline кнопки'}
                        </div>
                      </div>
                    </div>
                    <svg
                      className={`h-5 w-5 text-white/40 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.01] p-4">
                      <MediaButtonsEditor
                        attachments={attachments}
                        onAttachmentsChange={setAttachments}
                        buttons={inlineButtons}
                        onButtonsChange={setInlineButtons}
                        uploading={uploading}
                        setUploading={setUploading}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-4">
                    <div className="text-xs text-white/40">{body.length} символов</div>
                    <button
                      onClick={handleSend}
                      disabled={!body.trim() || sending || uploading}
                      className="rounded-full bg-gradient-to-r from-ocean-500 to-ocean-600 px-5 py-2 text-sm font-medium text-white hover:from-ocean-600 hover:to-ocean-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? 'Отправка...' : 'Отправить'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* History Card */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <button
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-gold-500/20 to-gold-600/10 flex items-center justify-center">
                  <svg className="h-5 w-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="font-medium text-white">История</div>
                  <div className="text-xs text-white/50">Последние рассылки</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-white/40">{broadcasts.length} записей</span>
                <svg
                  className={`h-5 w-5 text-white/40 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {historyOpen && (
              <div className="px-5 pb-5 border-t border-white/5 max-h-[400px] overflow-y-auto scrollbar-thin">
                {historyLoading ? (
                  <div className="py-8 text-center text-white/40 text-sm">Загрузка...</div>
                ) : broadcasts.length === 0 ? (
                  <div className="py-8 text-center">
                    <div className="text-3xl mb-2">📨</div>
                    <div className="text-sm text-white/50">Рассылок ещё не было</div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {broadcasts.slice(0, 10).map((broadcast) => (
                      <div
                        key={broadcast.id}
                        className="rounded-2xl border border-white/5 bg-white/[0.02] p-4"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex-1">
                            <div className="text-sm text-white/80 line-clamp-2">{broadcast.body}</div>
                            {(hasMedia(broadcast) || hasButtons(broadcast)) && (
                              <div className="flex items-center gap-2 mt-2">
                                {hasMedia(broadcast) && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    {broadcast.attachments?.length} медиа
                                  </span>
                                )}
                                {hasButtons(broadcast) && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-gold-500/10 px-2 py-0.5 text-[10px] text-gold-300">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                    </svg>
                                    {broadcast.inline_buttons?.flat().length} кнопок
                                  </span>
                                )}
                                {broadcast.target_statuses && !broadcast.target_statuses.includes('all') && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-ocean-500/10 px-2 py-0.5 text-[10px] text-ocean-300">
                                    👥 {broadcast.target_statuses.map(s => getTargetStatusLabel(s)).join(', ')}
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Show target status if no other badges but has specific target */}
                            {!hasMedia(broadcast) && !hasButtons(broadcast) && broadcast.target_statuses && !broadcast.target_statuses.includes('all') && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="inline-flex items-center gap-1 rounded-md bg-ocean-500/10 px-2 py-0.5 text-[10px] text-ocean-300">
                                  👥 {broadcast.target_statuses.map(s => getTargetStatusLabel(s)).join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${getStatusColor(
                              broadcast.status
                            )}`}
                          >
                            {getStatusLabel(broadcast.status)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-white/40">{formatDate(broadcast.created_at)}</span>
                          {broadcast.stats && (
                            <div className="flex items-center gap-3">
                              <span className="text-emerald-400">✓ {broadcast.stats.sent}</span>
                              {broadcast.stats.failed > 0 && (
                                <span className="text-rose-400">✗ {broadcast.stats.failed}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
