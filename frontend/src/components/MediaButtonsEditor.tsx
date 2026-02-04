import { useState, useRef } from 'react'
import { api, AttachmentData, InlineButton } from '../lib/api'

type Props = {
  attachments: AttachmentData[]
  onAttachmentsChange: (attachments: AttachmentData[]) => void
  buttons: InlineButton[][]
  onButtonsChange: (buttons: InlineButton[][]) => void
  uploading: boolean
  setUploading: (v: boolean) => void
}

export default function MediaButtonsEditor({
  attachments,
  onAttachmentsChange,
  buttons,
  onButtonsChange,
  uploading,
  setUploading,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const [showButtonEditor, setShowButtonEditor] = useState(false)
  const [newButtonText, setNewButtonText] = useState('')
  const [newButtonUrl, setNewButtonUrl] = useState('')
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set dragging to false if we're leaving the dropzone entirely
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging(false)
    
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      await handleFileUpload(files)
    }
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const newAttachments: AttachmentData[] = []
      for (const file of Array.from(files)) {
        const result = await api.upload(file)
        newAttachments.push({
          url: result.url,
          local_path: result.local_path,
          mime: result.mime,
          name: result.name,
          size: result.size,
        })
      }
      onAttachmentsChange([...attachments, ...newAttachments])
    } catch (error) {
      console.error('Upload failed:', error)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeAttachment = (index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index))
  }

  const [urlError, setUrlError] = useState<string | null>(null)

  const validateUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      // Check for common typos in domain
      const host = parsed.hostname.toLowerCase()
      if (host.includes(',')) {
        setUrlError('URL содержит запятую вместо точки в домене')
        return false
      }
      if (!host.includes('.')) {
        setUrlError('URL должен содержать домен (например, t.me)')
        return false
      }
      setUrlError(null)
      return true
    } catch {
      setUrlError('Неверный формат URL')
      return false
    }
  }

  const addButton = () => {
    if (!newButtonText.trim() || !newButtonUrl.trim()) return
    let url = newButtonUrl.trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    
    if (!validateUrl(url)) return
    
    const newButton: InlineButton = { text: newButtonText.trim(), url }
    if (editingRow !== null && buttons[editingRow]) {
      const newButtons = [...buttons]
      newButtons[editingRow] = [...newButtons[editingRow], newButton]
      onButtonsChange(newButtons)
    } else {
      // Add to new row
      onButtonsChange([...buttons, [newButton]])
    }
    setNewButtonText('')
    setNewButtonUrl('')
    setEditingRow(null)
  }

  const removeButton = (rowIndex: number, btnIndex: number) => {
    const newButtons = buttons.map((row, ri) =>
      ri === rowIndex ? row.filter((_, bi) => bi !== btnIndex) : row
    ).filter(row => row.length > 0)
    onButtonsChange(newButtons)
  }

  const getMediaPreview = (att: AttachmentData) => {
    const mime = (att.mime || '').toLowerCase()
    const name = (att.name || '').toLowerCase()
    const isImage = mime.startsWith('image/') || name.match(/\.(png|jpe?g|webp|gif|heic|heif)$/i)
    const isVideo = mime.startsWith('video/') || name.match(/\.(mp4|mov|mkv|webm)$/i)
    const isAudio = mime.startsWith('audio/') || name.match(/\.(mp3|wav|ogg|m4a)$/i)
    const src = att.url || att.local_path
    
    if (isImage && src) {
      return (
        <img
          src={src}
          alt={att.name || 'image'}
          className="h-16 w-16 rounded-xl object-cover"
        />
      )
    }
    if (isVideo) {
      return (
        <div className="h-16 w-16 rounded-xl bg-ocean-500/15 flex items-center justify-center">
          <svg className="h-6 w-6 text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
      )
    }
    if (isAudio) {
      return (
        <div className="h-16 w-16 rounded-xl bg-emerald-500/15 flex items-center justify-center">
          <svg className="h-6 w-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
      )
    }
    return (
      <div className="h-16 w-16 rounded-xl bg-white/5 flex items-center justify-center">
        <svg className="h-6 w-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Attachments Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/50">Вложения</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs text-ocean-400 hover:text-ocean-300 transition disabled:opacity-50"
          >
            {uploading ? 'Загрузка...' : '+ Добавить файл'}
          </button>
        </div>
        
        {/* Warning about adding more files when buttons exist */}
        {attachments.length === 1 && buttons.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>При добавлении второго файла кнопки не будут отправлены (ограничение Telegram)</span>
            </div>
          </div>
        )}
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar"
          onChange={(e) => handleFileUpload(e.target.files)}
          className="hidden"
        />
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-3">
            {attachments.map((att, index) => (
              <div key={index} className="relative group">
                {getMediaPreview(att)}
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500/90 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                >
                  ✕
                </button>
                <div className="absolute bottom-0 left-0 right-0 px-1 py-0.5 bg-black/60 rounded-b-xl">
                  <div className="text-[9px] text-white/70 truncate">{att.name || 'file'}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            ref={dropZoneRef}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-ocean-400 bg-ocean-500/10 scale-[1.02]'
                : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
            }`}
          >
            <div className={`mb-2 transition-transform ${dragging ? 'scale-110' : ''}`}>
              {dragging ? (
                <svg className="h-10 w-10 mx-auto text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              ) : (
                <svg className="h-10 w-10 mx-auto text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )}
            </div>
            <div className={`text-sm transition-colors ${dragging ? 'text-ocean-300' : 'text-white/40'}`}>
              {dragging ? 'Отпустите для загрузки' : 'Перетащите файлы сюда'}
            </div>
            <div className="text-xs text-white/20 mt-1">или нажмите для выбора • Фото, видео, аудио, документы</div>
          </div>
        )}
      </div>

      {/* Inline Buttons Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-white/50">Inline кнопки (URL)</label>
          {attachments.length > 1 ? (
            <span className="text-xs text-amber-400/70">Кнопки недоступны при нескольких медиа</span>
          ) : (
            <button
              type="button"
              onClick={() => setShowButtonEditor(!showButtonEditor)}
              className="text-xs text-ocean-400 hover:text-ocean-300 transition"
            >
              {showButtonEditor ? 'Скрыть' : '+ Добавить кнопку'}
            </button>
          )}
        </div>
        
        {/* Warning about media group limitation */}
        {attachments.length > 1 && buttons.length > 0 && (
          <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Telegram не позволяет добавлять кнопки к группе медиафайлов. Оставьте одно вложение или удалите кнопки.</span>
            </div>
          </div>
        )}
        
        {/* Existing buttons preview */}
        {buttons.length > 0 && (
          <div className="space-y-2 mb-3">
            {buttons.map((row, rowIndex) => (
              <div key={rowIndex} className="flex flex-wrap gap-2">
                {row.map((btn, btnIndex) => (
                  <div
                    key={btnIndex}
                    className="group flex items-center gap-1 rounded-xl border border-ocean-500/30 bg-ocean-500/10 px-3 py-1.5"
                  >
                    <a
                      href={btn.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ocean-300 hover:text-ocean-200"
                    >
                      {btn.text}
                    </a>
                    <button
                      type="button"
                      onClick={() => removeButton(rowIndex, btnIndex)}
                      className="text-white/30 hover:text-rose-400 transition ml-1"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setEditingRow(rowIndex)
                    setShowButtonEditor(true)
                  }}
                  className="text-xs text-white/30 hover:text-white/50 border border-dashed border-white/10 rounded-xl px-2 py-1.5"
                >
                  + в ряд
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Button editor */}
        {showButtonEditor && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <div className="text-xs text-white/50 mb-2">
              {editingRow !== null ? `Добавить кнопку в ряд ${editingRow + 1}` : 'Новый ряд кнопок'}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-white/40 mb-1">Текст кнопки</label>
                <input
                  value={newButtonText}
                  onChange={(e) => setNewButtonText(e.target.value)}
                  placeholder="Открыть сайт"
                  className="w-full rounded-xl bg-ink-800/60 border border-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-white/40 mb-1">URL ссылки</label>
                <input
                  value={newButtonUrl}
                  onChange={(e) => {
                    setNewButtonUrl(e.target.value)
                    setUrlError(null)
                  }}
                  placeholder="https://example.com"
                  className={`w-full rounded-xl bg-ink-800/60 border px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none ${urlError ? 'border-rose-500/50 focus:border-rose-500' : 'border-white/10 focus:border-ocean-500/50'}`}
                />
                {urlError && (
                  <div className="text-[10px] text-rose-400 mt-1">{urlError}</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={addButton}
                disabled={!newButtonText.trim() || !newButtonUrl.trim()}
                className="rounded-xl bg-ocean-500/20 border border-ocean-500/30 px-4 py-1.5 text-xs text-ocean-300 hover:bg-ocean-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Добавить
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowButtonEditor(false)
                  setEditingRow(null)
                  setNewButtonText('')
                  setNewButtonUrl('')
                }}
                className="text-xs text-white/40 hover:text-white/60"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {buttons.length === 0 && !showButtonEditor && (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-center">
            <div className="text-xs text-white/30">Кнопки будут отображаться под сообщением</div>
          </div>
        )}
      </div>
    </div>
  )
}
