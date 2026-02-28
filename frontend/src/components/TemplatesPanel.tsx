import { useEffect, useState } from 'react'
import { api, Template, AttachmentData, InlineButton } from '../lib/api'
import MediaButtonsEditor from './MediaButtonsEditor'

export default function TemplatesPanel() {
  const [items, setItems] = useState<Template[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Template | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [attachments, setAttachments] = useState<AttachmentData[]>([])
  const [inlineButtons, setInlineButtons] = useState<InlineButton[][]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [movingId, setMovingId] = useState<number | null>(null)

  const load = () => api.listTemplates().then(setItems)

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (!selected) {
      setTitle('')
      setBody('')
      setAttachments([])
      setInlineButtons([])
      setShowAdvanced(false)
      return
    }
    setTitle(selected.title)
    setBody(selected.body)
    setAttachments(selected.attachments || [])
    setInlineButtons(selected.inline_buttons || [])
    setShowAdvanced((selected.attachments?.length || 0) > 0 || (selected.inline_buttons?.length || 0) > 0)
  }, [selected])

  useEffect(() => {
    if (!successToast) return
    const timeout = setTimeout(() => setSuccessToast(null), 3000)
    return () => clearTimeout(timeout)
  }, [successToast])

  const orderedItems = [...items].sort((a, b) => {
    const left = typeof a.sort_order === 'number' ? a.sort_order : a.id
    const right = typeof b.sort_order === 'number' ? b.sort_order : b.id
    return left - right || a.id - b.id
  })

  const filtered = orderedItems.filter((t) =>
    `${t.title} ${t.body}`.toLowerCase().includes(query.toLowerCase())
  )

  const handleMove = async (templateId: number, direction: 'up' | 'down') => {
    const sorted = [...items].sort((a, b) => {
      const left = typeof a.sort_order === 'number' ? a.sort_order : a.id
      const right = typeof b.sort_order === 'number' ? b.sort_order : b.id
      return left - right || a.id - b.id
    })
    const index = sorted.findIndex((t) => t.id === templateId)
    if (index < 0) return
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= sorted.length) return

    const current = sorted[index]
    const target = sorted[targetIndex]
    const currentOrder = typeof current.sort_order === 'number' ? current.sort_order : current.id
    const targetOrder = typeof target.sort_order === 'number' ? target.sort_order : target.id

    setMovingId(templateId)
    const optimistic = items.map((item) => {
      if (item.id === current.id) return { ...item, sort_order: targetOrder }
      if (item.id === target.id) return { ...item, sort_order: currentOrder }
      return item
    })
    setItems(optimistic)
    if (selected?.id === current.id) setSelected({ ...current, sort_order: targetOrder })
    if (selected?.id === target.id) setSelected({ ...target, sort_order: currentOrder })

    try {
      await Promise.all([
        api.updateTemplate(current.id, { sort_order: targetOrder }),
        api.updateTemplate(target.id, { sort_order: currentOrder })
      ])
      await load()
      setSuccessToast('Порядок шаблонов обновлён')
    } catch (error) {
      console.error('Failed to reorder templates:', error)
      await load()
    } finally {
      setMovingId(null)
    }
  }

  const handleSave = async () => {
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    try {
      const payload = {
        title,
        body,
        attachments: attachments.length > 0 ? attachments : null,
        inline_buttons: inlineButtons.length > 0 ? inlineButtons : null,
      }
      if (selected) {
        await api.updateTemplate(selected.id, payload)
        setSuccessToast('Шаблон обновлён')
      } else {
        await api.createTemplate(payload)
        setSuccessToast('Шаблон создан')
        setTitle('')
        setBody('')
        setAttachments([])
        setInlineButtons([])
        setShowAdvanced(false)
      }
      load()
    } catch (error) {
      console.error('Failed to save template:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selected) return
    try {
      await api.deleteTemplate(selected.id)
      setSelected(null)
      setDeleteConfirm(false)
      setSuccessToast('Шаблон удалён')
      load()
    } catch (error) {
      console.error('Failed to delete template:', error)
    }
  }

  const hasMedia = (t: Template) => (t.attachments?.length || 0) > 0
  const hasButtons = (t: Template) => (t.inline_buttons?.length || 0) > 0

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-display font-semibold text-white">Шаблоны</h1>
          <p className="text-sm text-white/50 mt-1">Готовые ответы для быстрой отправки клиентам</p>
        </div>

        {successToast && (
          <div className="fixed top-20 right-6 z-50 rounded-2xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100 shadow-lg backdrop-blur-sm">
            ✓ {successToast}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-ocean-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">{items.length}</div>
                <div className="text-xs text-white/50">Всего шаблонов</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">{items.filter(hasMedia).length}</div>
                <div className="text-xs text-white/50">С медиа</div>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gold-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <div className="text-2xl font-semibold text-white">{items.filter(hasButtons).length}</div>
                <div className="text-xs text-white/50">С кнопками</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Templates List */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center gap-4">
                <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-ocean-500/20 to-ocean-600/10 flex items-center justify-center">
                  <svg className="h-5 w-5 text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">Список шаблонов</div>
                  <div className="text-xs text-white/50">{items.length} шаблонов</div>
                </div>
              </div>
              <div className="mt-4 relative">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск шаблона..."
                  className="w-full rounded-2xl bg-ink-800/60 border border-white/10 pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            <div className="p-4 max-h-[500px] overflow-y-auto scrollbar-thin space-y-2">
              {filtered.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-3xl mb-2">📋</div>
                  <div className="text-sm text-white/50">
                    {items.length === 0 ? 'Шаблонов ещё нет' : 'Ничего не найдено'}
                  </div>
                </div>
              ) : (
                filtered.map((item) => {
                  const sorted = orderedItems
                  const index = sorted.findIndex((t) => t.id === item.id)
                  const canMoveUp = index > 0
                  const canMoveDown = index >= 0 && index < sorted.length - 1
                  return (
                  <button
                    key={item.id}
                    onClick={() => setSelected(item)}
                    className={`w-full text-left rounded-2xl border p-4 transition ${
                      selected?.id === item.id
                        ? 'border-ocean-500/40 bg-ocean-600/10'
                        : 'border-white/5 bg-white/[0.02] hover:bg-white/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-white/90">{item.title}</div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (!canMoveUp || movingId === item.id) return
                            void handleMove(item.id, 'up')
                          }}
                          disabled={!canMoveUp || movingId === item.id}
                          className="h-6 w-6 rounded-md border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Переместить выше"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            if (!canMoveDown || movingId === item.id) return
                            void handleMove(item.id, 'down')
                          }}
                          disabled={!canMoveDown || movingId === item.id}
                          className="h-6 w-6 rounded-md border border-white/10 text-white/60 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Переместить ниже"
                        >
                          ↓
                        </button>
                        {hasMedia(item) && (
                          <span className="h-5 w-5 rounded-md bg-emerald-500/15 flex items-center justify-center" title="Есть медиа">
                            <svg className="h-3 w-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </span>
                        )}
                        {hasButtons(item) && (
                          <span className="h-5 w-5 rounded-md bg-gold-500/15 flex items-center justify-center" title="Есть кнопки">
                            <svg className="h-3 w-3 text-gold-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                            </svg>
                          </span>
                        )}
                        {selected?.id === item.id && (
                          <span className="h-2 w-2 rounded-full bg-ocean-400"></span>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-white/40 line-clamp-2 mt-1">{item.body}</div>
                  </button>
                )})
              )}
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 flex items-center justify-center">
                    <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-white">
                      {selected ? 'Редактирование' : 'Новый шаблон'}
                    </div>
                    <div className="text-xs text-white/50">
                      {selected ? `ID: ${selected.id}` : 'Создайте новый шаблон'}
                    </div>
                  </div>
                </div>
                {selected && (
                  <button
                    onClick={() => setSelected(null)}
                    className="text-xs text-white/40 hover:text-white/70 transition"
                  >
                    + Новый
                  </button>
                )}
              </div>
            </div>
            <div className="p-5 space-y-4 max-h-[600px] overflow-y-auto scrollbar-thin">
              <div>
                <label className="block text-xs text-white/50 mb-2">Название</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Введите название шаблона"
                  className="w-full rounded-2xl bg-ink-800/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-2">Текст шаблона</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Введите текст шаблона..."
                  rows={5}
                  className="w-full rounded-2xl bg-ink-800/60 border border-white/10 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50 resize-none"
                />
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                  <span>HTML:</span>
                  <code className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">&lt;b&gt;&lt;/b&gt;</code>
                  <code className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">&lt;i&gt;&lt;/i&gt;</code>
                  <code className="px-1.5 py-0.5 rounded bg-white/5 text-[10px]">&lt;code&gt;&lt;/code&gt;</code>
                </div>
              </div>

              {/* Advanced Section Toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm hover:bg-white/5 transition"
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
                <div className="rounded-2xl border border-white/10 bg-white/[0.01] p-4">
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

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  {selected && (
                    <button
                      onClick={() => setDeleteConfirm(true)}
                      className="rounded-full border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300 hover:bg-rose-500/20 transition"
                    >
                      Удалить
                    </button>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  disabled={!title.trim() || !body.trim() || saving || uploading}
                  className="rounded-full bg-gradient-to-r from-ocean-500 to-ocean-600 px-6 py-2 text-sm font-medium text-white hover:from-ocean-600 hover:to-ocean-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Сохранение...' : selected ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-[380px] max-w-full rounded-2xl border border-white/10 bg-gradient-to-b from-ink-800 to-ink-900 p-5 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-rose-500/15 flex items-center justify-center">
                  <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div>
                  <div className="text-base font-semibold text-white">Удалить шаблон?</div>
                  <div className="text-xs text-white/50">Это действие нельзя отменить</div>
                </div>
              </div>
              <div className="mt-3 rounded-xl bg-rose-500/10 border border-rose-500/20 p-3">
                <div className="text-xs text-white/60">
                  Шаблон <span className="text-white/90 font-medium">«{selected?.title}»</span> будет удалён.
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Отмена
                </button>
                <button
                  className="flex-1 rounded-xl bg-rose-500 py-2 text-sm text-white font-medium hover:bg-rose-600 transition-colors"
                  onClick={handleDelete}
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
