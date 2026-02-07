import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { api, Chat, Message, InlineButton } from '../lib/api'

function AudioPlayer({ src, isVoice, name }: { src: string; isVoice: boolean; name?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || seconds < 0 || isNaN(seconds)) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const updateDuration = () => {
    const audio = audioRef.current
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration)
    }
  }

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = x / rect.width
    audio.currentTime = pct * duration
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 min-w-[180px] max-w-[240px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={updateDuration}
        onDurationChange={updateDuration}
        onCanPlay={updateDuration}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setCurrentTime(0) }}
      />
      <button
        type="button"
        onClick={togglePlay}
        className="h-8 w-8 shrink-0 rounded-full bg-ocean-500 hover:bg-ocean-400 flex items-center justify-center text-white transition"
      >
        {playing ? (
          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          className="h-1.5 bg-white/10 rounded-full cursor-pointer overflow-hidden"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-ocean-400 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-white/50">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
      <a
        href={src}
        download={name || (isVoice ? 'voice.ogg' : 'audio.mp3')}
        className="shrink-0 h-6 w-6 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:bg-white/10 hover:text-white/70"
        title="Скачать"
      >
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </a>
    </div>
  )
}

export default function ChatWindow({
  chat,
  messages,
  onMessageSent,
  onMessageDeleted,
  highlight,
  templates = [],
  onBack,
  onShowProfile,
  onChatUpdated,
  userRole,
  hasMoreMessages = false,
  loadingMoreMessages = false,
  onLoadMoreMessages
}: {
  chat?: Chat
  messages: Message[]
  onMessageSent: () => void
  onMessageDeleted?: () => void
  highlight?: string
  templates?: { id: number; title: string; body: string; attachments?: any[] | null; inline_buttons?: { text: string; url: string }[][] | null }[]
  onBack?: () => void
  onShowProfile?: () => void
  onChatUpdated?: (patch: Partial<Chat>) => void
  userRole?: 'administrator' | 'moderator' | null
  hasMoreMessages?: boolean
  loadingMoreMessages?: boolean
  onLoadMoreMessages?: () => void
}) {
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const safeText = (value?: unknown) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value.replace(/<[^>]*>/g, '')
    return String(value)
  }
  const formatMsgTime = (iso?: string) => {
    if (!iso) return ''
    const date = new Date(iso)
    const now = new Date()
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    return sameDay
      ? date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [buttonsOpen, setButtonsOpen] = useState(false)
  const [pendingButtons, setPendingButtons] = useState<InlineButton[][]>([])
  const [newButtonText, setNewButtonText] = useState('')
  const [newButtonUrl, setNewButtonUrl] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [pendingAttachments, setPendingAttachments] = useState<any[]>([])
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [expandedMedia, setExpandedMedia] = useState<Record<string, boolean>>({})
  const [noteText, setNoteText] = useState('')
  const [noteEditing, setNoteEditing] = useState(false)
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [deleteMode, setDeleteMode] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Message | null>(null)
  const [failedStickers, setFailedStickers] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const seenRef = useRef<Set<string>>(new Set())
  const smoothScrollRef = useRef(false)
  const initialLoadRef = useRef(true)
  const needsScrollRef = useRef(false)
  const keepScrollingUntilRef = useRef<number>(0)
  const lastCountRef = useRef(0)
  const lastChatRef = useRef<string | undefined>(undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const topLoaderRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number>(0)

  // Load more messages when scrolling to top
  useEffect(() => {
    if (!hasMoreMessages || loadingMoreMessages || !onLoadMoreMessages || !chat) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !initialLoadRef.current) {
          // Save scroll height before loading
          const el = listRef.current
          if (el) {
            prevScrollHeightRef.current = el.scrollHeight
          }
          onLoadMoreMessages()
        }
      },
      { threshold: 0.1, rootMargin: '50px' }
    )

    const el = topLoaderRef.current
    if (el) observer.observe(el)

    return () => {
      if (el) observer.unobserve(el)
    }
  }, [hasMoreMessages, loadingMoreMessages, onLoadMoreMessages, chat?.id])

  // Maintain scroll position after loading older messages
  useEffect(() => {
    if (prevScrollHeightRef.current > 0 && !loadingMoreMessages) {
      const el = listRef.current
      if (el) {
        const newScrollHeight = el.scrollHeight
        const diff = newScrollHeight - prevScrollHeightRef.current
        if (diff > 0) {
          el.scrollTop = diff
        }
        prevScrollHeightRef.current = 0
      }
    }
  }, [messages.length, loadingMoreMessages])

  // Helper to scroll to bottom
  const scrollToBottom = () => {
    const el = listRef.current
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
    }
  }
  const photoRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const attachRef = useRef<HTMLDivElement>(null)
  const noteDebounceRef = useRef<number | null>(null)
  const touchStart = useRef<{ x: number; y: number; id: string | null }>({ x: 0, y: 0, id: null })
  const touchTriggered = useRef(false)
  const emojiList = [
    '😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳','😇','😉','🥰','🤔','😴','😭','😡','🤝','👍','👎',
    '🙏','👏','🔥','✨','💬','✅','❗️','💡','🎉','🎯','🚀','❤️','🧡','💛','💚','💙','💜','🤍','🖤','🤎',
    '⚡️','⭐️','🌙','☀️','💎','🔔','🔒','🔓','📎','📌','📷','🎥','🎧','💻','📱','🧠','🧾','🗂️','🗓️','✅'
  ]

  useEffect(() => {
    setText('')
    setReplyTo(null)
    setPendingAttachments([])
    setStickToBottom(true)
    smoothScrollRef.current = false
    initialLoadRef.current = true
    seenRef.current.clear()
    setNoteText(chat?.note || '')
    setNoteEditing(false)
    setNoteStatus('idle')
    setDeleteMode(false)
    setConfirmDelete(null)
    setFailedStickers(new Set())
  }, [chat?.id])

  useEffect(() => {
    if (!chat) return
    if (!noteEditing && noteText === (chat.note || '')) return
    if (noteDebounceRef.current) window.clearTimeout(noteDebounceRef.current)
    noteDebounceRef.current = window.setTimeout(async () => {
      if (!noteEditing && !noteText.trim()) return
      setNoteStatus('saving')
      try {
        const updated = await api.updateChatNote(chat.id, noteText.trim() ? noteText : null)
        onChatUpdated?.(updated)
        setNoteStatus('saved')
        setTimeout(() => setNoteStatus('idle'), 1200)
      } catch {
        setNoteStatus('idle')
      }
    }, 600)
    return () => {
      if (noteDebounceRef.current) window.clearTimeout(noteDebounceRef.current)
    }
  }, [noteText, noteEditing, chat?.id])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const ro = new ResizeObserver(() => {
      setViewportHeight(el.clientHeight)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Watch for content size changes and keep scrolling to bottom during initial load
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const scrollContent = el.firstElementChild as HTMLElement | null
    if (!scrollContent) return
    let lastHeight = scrollContent.scrollHeight
    const ro = new ResizeObserver(() => {
      const newHeight = scrollContent.scrollHeight
      if (newHeight !== lastHeight && Date.now() < keepScrollingUntilRef.current) {
        lastHeight = newHeight
        el.scrollTop = el.scrollHeight
      }
    })
    ro.observe(scrollContent)
    return () => ro.disconnect()
  }, [chat?.id])

  useEffect(() => {
    if (!emojiOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!emojiRef.current) return
      if (!emojiRef.current.contains(event.target as Node)) {
        setEmojiOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [emojiOpen])

  useEffect(() => {
    if (!chat) return
    const handler = (event: ClipboardEvent) => {
      if (!event.clipboardData) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (target !== inputRef.current) return
      }
      const items = Array.from(event.clipboardData.items || [])
      const files: File[] = []
      for (const item of items) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        event.preventDefault()
        addFilesToPending(files)
        inputRef.current?.focus()
      }
    }
    window.addEventListener('paste', handler as unknown as EventListener)
    return () => window.removeEventListener('paste', handler as unknown as EventListener)
  }, [chat?.id])

  useEffect(() => {
    if (!lightboxSrc) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightboxSrc(null)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [lightboxSrc])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (confirmDelete) setConfirmDelete(null)
        else if (deleteMode) setDeleteMode(false)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [confirmDelete, deleteMode])

  useEffect(() => {
    if (!attachOpen) return
    const handleClick = (event: MouseEvent) => {
      if (!attachRef.current) return
      if (!attachRef.current.contains(event.target as Node)) {
        setAttachOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [attachOpen])

  useEffect(() => {
    if (!inputRef.current) return
    inputRef.current.style.height = '0px'
    const next = Math.min(inputRef.current.scrollHeight, 220)
    inputRef.current.style.height = `${next}px`
  }, [text])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const chatId = chat?.id
    const count = messages.length
    const chatChanged = chatId !== lastChatRef.current
    const countChanged = count !== lastCountRef.current

    if (chatChanged) {
      lastChatRef.current = chatId
      lastCountRef.current = 0
      needsScrollRef.current = true
      initialLoadRef.current = true
      keepScrollingUntilRef.current = 0
      return
    }

    lastCountRef.current = count

    // Scroll to bottom when messages first load after chat change
    if (needsScrollRef.current && count > 0) {
      needsScrollRef.current = false
      initialLoadRef.current = false
      // Keep auto-scrolling to bottom for 2 seconds to handle media loading
      keepScrollingUntilRef.current = Date.now() + 2000
      // Immediate scroll
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
      })
      return
    }

    if (!stickToBottom || !countChanged) return
    const newest = messages[0]
    if (newest && newest.direction !== 'IN' && newest.direction !== 'OUT') return
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: smoothScrollRef.current ? 'smooth' : 'auto' })
      smoothScrollRef.current = false
    })
  }, [messages.length, chat?.id, stickToBottom])

  useEffect(() => {
    messages.forEach((m) => {
      if (m.id) seenRef.current.add(m.id)
    })
  }, [messages])

  const useVirtual = messages.length > 200
  const virtual = useMemo(() => {
    const ESTIMATE = 96
    const total = messages.length
    if (!viewportHeight || !useVirtual) {
      return { items: messages, paddingTop: 0, paddingBottom: 0, offset: 0 }
    }
    const start = Math.max(0, Math.floor(scrollTop / ESTIMATE) - 12)
    const end = Math.min(total, Math.ceil((scrollTop + viewportHeight) / ESTIMATE) + 12)
    return {
      items: messages.slice(start, end),
      paddingTop: start * ESTIMATE,
      paddingBottom: Math.max(0, (total - end) * ESTIMATE),
      offset: start
    }
  }, [messages, scrollTop, viewportHeight, useVirtual])

  const handleSend = async () => {
    if (!chat || (!text.trim() && pendingAttachments.length === 0)) return
    const textToSend = text.trim() ? text : ''
    const attachmentsToSend = [...pendingAttachments]
    // Don't send buttons if more than 1 attachment (Telegram limitation)
    const buttonsToSend = pendingButtons.length > 0 && attachmentsToSend.length <= 1 ? [...pendingButtons] : undefined
    const replyToId = replyTo?.id
    setSending(true)
    setText('')
    setReplyTo(null)
    setPendingAttachments([])
    setPendingButtons([])
    try {
      const firstType = attachmentsToSend[0]?.type || 'text'
      await api.sendMessage(chat.id, {
        text: textToSend ? textToSend : undefined,
        type: firstType,
        attachments: attachmentsToSend.map((a) => a.upload),
        inline_buttons: buttonsToSend,
        reply_to_message_id: replyToId
      })
      smoothScrollRef.current = true
      onMessageSent()
    } catch {
      setText(textToSend)
      setPendingAttachments(attachmentsToSend)
      setPendingButtons(buttonsToSend || [])
      setReplyTo(messages.find((m) => m.id === replyToId) || null)
    } finally {
      setSending(false)
    }
  }

  const pickTypeFromFile = (file: File) => {
    const type = file.type
    if (type === 'image/gif') return 'animation'
    if (type.startsWith('image/')) return 'photo'
    if (type.startsWith('video/')) return 'video'
    if (type.startsWith('audio/')) return 'audio'
    return 'document'
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData.items
    const files: File[] = []
    const seenNames = new Set<string>()
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          // Deduplicate by name+size+type to avoid double paste
          const key = `${file.name}-${file.size}-${file.type}`
          if (!seenNames.has(key)) {
            seenNames.add(key)
            files.push(file)
          }
        }
      }
    }
    if (files.length > 0 && chat) {
      event.preventDefault()
      event.stopPropagation()
      await addFilesToPending(files)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (!chat) return
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await addFilesToPending(files)
    }
  }

  const addFilesToPending = async (files: File[]) => {
    if (!files.length || !chat) return
    setSending(true)
    const next: any[] = []
    for (const file of files) {
      const upload = await api.upload(file)
      const type = pickTypeFromFile(file)
      next.push({ upload, type, name: file.name, mime: file.type })
    }
    setPendingAttachments((prev) => [...prev, ...next])
    setSending(false)
  }

  return (
    <div 
      className="flex h-full min-h-0 flex-col relative overflow-x-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-900/90 border-2 border-dashed border-ocean-500 rounded-2xl">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-ocean-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div className="text-lg font-medium text-white">Перетащите файлы сюда</div>
            <div className="text-sm text-white/50 mt-1">Отпустите для загрузки</div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-white/10 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-lg font-display font-semibold">
            {onBack && (
              <button
                onClick={onBack}
                className="xl:hidden h-8 w-8 rounded-full text-white/70 hover:bg-white/10 shrink-0"
                aria-label="Назад"
              >
                ←
              </button>
            )}
            <span className="truncate max-w-[60vw] sm:max-w-[28rem]">
              {chat ? safeText(chat.first_name || 'Диалог') : 'Выберите чат'}
            </span>
          </div>
          <div className="text-xs text-white/50">{chat ? `ID ${chat.tg_id}` : '—'}</div>
        </div>
        {onShowProfile && chat && (
          <button
            onClick={onShowProfile}
            className="xl:hidden ml-2 h-8 w-8 rounded-full text-[11px] text-white/70 hover:bg-white/10 shrink-0"
            aria-label="Информация"
          >
            ⓘ
          </button>
        )}
        {chat && userRole === 'administrator' && (
          <button
            type="button"
            onClick={() => setDeleteMode((v) => !v)}
            className={clsx(
              'sm:hidden ml-2 h-8 w-8 rounded-full border text-xs flex items-center justify-center shrink-0',
              deleteMode ? 'border-rose-500/50 bg-rose-500/20' : 'border-white/10 text-white/70 hover:bg-white/10'
            )}
            aria-label={deleteMode ? 'Выйти из режима удаления' : 'Режим удаления'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        {chat && userRole === 'administrator' && (
          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDeleteMode((v) => !v)}
              className={clsx(
                'px-3 py-1.5 rounded-full border text-xs transition flex items-center gap-1.5',
                deleteMode
                  ? 'border-rose-500/50 bg-rose-500/20 text-rose-200'
                  : 'border-white/10 text-white/70 hover:bg-white/10'
              )}
              title={deleteMode ? 'Выйти из режима удаления' : 'Режим удаления сообщений'}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleteMode ? 'Отмена' : 'Удалить'}
            </button>
          </div>
        )}
      </div>

      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-thin mt-4 pr-2 no-anchor"
        onScroll={() => {
          const el = listRef.current
          if (!el) return
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          setStickToBottom(atBottom)
          if (useVirtual) setScrollTop(el.scrollTop)
        }}
      >
        {chat && (noteText.trim() || noteEditing) && (
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-white/10 bg-ink-900/80 backdrop-blur px-4 py-3 text-xs text-white/80 shadow-soft">
            <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
              <span>Комментарий</span>
              <span>
                {noteStatus === 'saving' && 'Сохраняем…'}
                {noteStatus === 'saved' && 'Сохранено'}
              </span>
            </div>
            {noteEditing ? (
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-xl bg-ink-800/80 border border-white/10 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ocean-500/20"
              />
            ) : (
              <div className="whitespace-pre-line">{noteText}</div>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setNoteEditing((v) => !v)}
                className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/70 hover:bg-white/10"
              >
                {noteEditing ? 'Свернуть' : 'Редактировать'}
              </button>
                {noteEditing && (
                  <button
                    type="button"
                    onClick={() => {
                      setNoteText('')
                      setNoteEditing(false)
                      if (chat) {
                        api.updateChatNote(chat.id, null)
                          .then((updated) => onChatUpdated?.(updated))
                          .catch(() => {})
                      }
                    }}
                    className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/70 hover:bg-white/10"
                  >
                    Очистить
                </button>
              )}
            </div>
          </div>
        )}
        {deleteMode && chat && (
          <div className="sticky top-0 z-10 mb-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-xs text-rose-200">Нажмите на сообщение для удаления</span>
            <button
              type="button"
              onClick={() => setDeleteMode(false)}
              className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/70 hover:bg-white/10"
            >
              Выйти
            </button>
          </div>
        )}
        {chat && !noteText.trim() && !noteEditing && !deleteMode && (
          <div className="sticky top-0 z-10 mb-3">
            <button
              type="button"
              onClick={() => setNoteEditing(true)}
              className="w-full rounded-2xl border border-white/10 bg-ink-900/70 backdrop-blur px-4 py-3 text-left text-xs text-white/60 hover:bg-white/5"
            >
              + Добавить комментарий
            </button>
          </div>
        )}
        {!chat && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] flex items-center justify-center">
              <svg className="h-9 w-9 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div className="text-center">
              <div className="text-white/50 text-sm font-medium">Выберите диалог</div>
              <div className="text-white/30 text-xs mt-1">Чтобы начать общение с клиентом</div>
            </div>
          </div>
        )}
        {chat && messages.length === 0 && !loadingMoreMessages && (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-ocean-500/10 to-ocean-600/5 border border-ocean-500/10 flex items-center justify-center">
              <svg className="h-7 w-7 text-ocean-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <div className="text-white/40 text-sm">Сообщений пока нет</div>
          </div>
        )}
        {/* Load more messages trigger (at top) */}
        {chat && hasMoreMessages && (
          <div ref={topLoaderRef} className="py-3 flex justify-center">
            {loadingMoreMessages ? (
              <div className="flex items-center gap-2 text-white/40 text-xs">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Загрузка...
              </div>
            ) : (
              <div className="text-white/20 text-xs">Прокрутите вверх для загрузки</div>
            )}
          </div>
        )}
        <div className="flex flex-col gap-3" style={{ paddingTop: virtual.paddingTop, paddingBottom: virtual.paddingBottom }}>
          {virtual.items.map((msg) => (
            (() => {
              if (!msg) return null
              const replied = msg.reply_to_telegram_message_id
                ? messages.find((m) => m.telegram_message_id === msg.reply_to_telegram_message_id)
                : undefined
              const senderLabel =
                msg.type === 'system'
                  ? 'Системное'
                  : msg.direction === 'IN'
                    ? safeText(chat?.first_name || chat?.tg_username || 'Пользователь')
                    : 'Вы'
              const isNew = !initialLoadRef.current && !seenRef.current.has(msg.id)
              return (
            <div
              key={msg.id}
              className={clsx(
                msg.type === 'system'
                  ? 'self-center rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-white/60 flex items-center gap-1'
                  : 'group relative rounded-lg sm:rounded-xl px-2.5 sm:px-3 pt-4 pb-1.5 sm:pt-3 sm:pb-2 text-[11px] sm:text-xs leading-relaxed ' +
                    (msg.direction === 'OUT'
                      ? 'self-end bg-ocean-600/20 border border-ocean-500/20'
                      : 'self-start bg-white/5 border border-white/10') +
                    (msg.attachments && msg.attachments.length > 0
                      ? ' max-w-[75%] sm:max-w-[65%]'
                      : ' max-w-[85%] sm:max-w-[75%]'),
                isNew && msg.type !== 'system' && 'msg-appear'
              )}
              onTouchStart={(e) => {
                if (msg.type === 'system') return
                const t = e.touches[0]
                touchStart.current = { x: t.clientX, y: t.clientY, id: msg.id }
                touchTriggered.current = false
              }}
              onTouchMove={(e) => {
                if (msg.type === 'system') return
                if (touchTriggered.current || touchStart.current.id !== msg.id) return
                if (!msg.telegram_message_id) return
                const t = e.touches[0]
                const dx = t.clientX - touchStart.current.x
                const dy = t.clientY - touchStart.current.y
                if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
                  touchTriggered.current = true
                  setReplyTo(msg)
                }
              }}
            >
              {msg.type === 'system' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-white/70">
                    Системное
                  </span>
                  <div className="flex-1">{msg.text}</div>
                  {deleteMode && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(msg)}
                      disabled={deletingId === msg.id}
                      className="rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[10px] text-rose-200 hover:bg-rose-500/30 disabled:opacity-50"
                    >
                      {deletingId === msg.id ? '…' : 'Удалить'}
                    </button>
                  )}
                </div>
              ) : (
                <>
              <div className="mb-0.5 text-[9px] text-white/50">{senderLabel}</div>
              {/* Forwarded message indicator */}
              {msg.forward_from_name && (
                <div className="mb-2 flex items-center gap-1.5 text-[10px] text-white/40">
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                  <span>Переслано от</span>
                  {msg.forward_from_username ? (
                    <a
                      href={`https://t.me/${msg.forward_from_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-ocean-400 hover:text-ocean-300 font-medium"
                    >
                      {msg.forward_from_name}
                    </a>
                  ) : (
                    <span className="text-white/60 font-medium">{msg.forward_from_name}</span>
                  )}
                </div>
              )}
              {msg.reply_to_telegram_message_id && (
                <div className="mb-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
                  <div className="text-white/50 mb-1">Ответ на сообщение</div>
                  <div className="truncate text-white/80">
                    {replied?.text ? replied.text : replied ? replied.type : 'Сообщение недоступно'}
                  </div>
                </div>
              )}
              {deleteMode ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(msg)}
                  disabled={deletingId === msg.id}
                  className="absolute top-1 right-2 flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-1 text-[10px] text-rose-200 shadow-soft hover:bg-rose-500/30 disabled:opacity-50"
                  title="Удалить сообщение"
                >
                  {deletingId === msg.id ? '…' : (
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                  Удалить
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setReplyTo(msg)}
                  className={clsx(
                    'absolute top-1 right-2 hidden group-hover:flex items-center gap-1 rounded-full border border-white/10 bg-ink-900/90 px-2 py-1 text-[10px] text-white/70 shadow-soft',
                    !msg.telegram_message_id && 'opacity-50 cursor-not-allowed'
                  )}
                  disabled={!msg.telegram_message_id}
                  title="Ответить"
                >
                  ↩
                </button>
              )}
              {msg.text ? (
                <div>
                  {highlight && highlight.trim().length > 0
                    ? safeText(msg.text).split(new RegExp(`(${escapeRegExp(highlight)})`, 'ig')).map((part, idx) =>
                        part.toLowerCase() === highlight.toLowerCase() ? (
                          <mark
                            key={idx}
                            className="bg-gold-500/40 text-white rounded px-1"
                          >
                            {part}
                          </mark>
                        ) : (
                          <span key={idx}>{part}</span>
                        )
                      )
                    : safeText(msg.text)}
                  {msg.is_edited && (
                    <span className="ml-2 text-[10px] text-white/40">изменено</span>
                  )}
                </div>
              ) : msg.type === 'location' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">📍</span>
                  <span>Геопозиция</span>
                </div>
              ) : msg.type === 'contact' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">👤</span>
                  <span>Контакт</span>
                </div>
              ) : msg.type === 'venue' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">📍</span>
                  <span>Место на карте</span>
                </div>
              ) : msg.type === 'poll' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">📊</span>
                  <span>Опрос</span>
                </div>
              ) : null}
              {(() => {
                const attachments = (msg.attachments || []).filter(Boolean) as any[]
                if (attachments.length === 0) return null
                const media = attachments.filter((att) => {
                  if (!att) return false
                  const mime = (att.mime || '').toLowerCase()
                  const name = (att.name || '').toLowerCase()
                  const isImage = mime.startsWith('image/') || name.match(/\.(png|jpe?g|webp|gif|tgs|heic|heif)$/i)
                  const isVideo = mime.startsWith('video/') || name.match(/\.(mp4|mov|mkv|webm)$/)
                  const isAnimation = msg.type === 'animation' || msg.type === 'sticker' || mime === 'video/mp4' && name.includes('gif')
                  return isImage || isVideo || isAnimation
                })
                const other = attachments.filter((att) => !media.includes(att))
                const renderSingle = (att: any, index: number) => {
                  if (!att) return null
                  const src = att.url || att.local_path
                  const mime = (att.mime || '').toLowerCase()
                  const name = (att.name || '').toLowerCase()
                  const isSticker = msg.type === 'sticker'
                  const isVideoNote = msg.type === 'video_note'
                  const isAnimation = msg.type === 'animation' || (mime === 'video/mp4' && name.includes('gif'))
                  const isAnimatedSticker = name.endsWith('.tgs') || mime === 'application/x-tgsticker'
                  const isWebpSticker = isSticker && (mime === 'image/webp' || name.endsWith('.webp'))
                  const isImage =
                    !isSticker && !isAnimation && !isVideoNote && (
                      mime.startsWith('image/') ||
                      name.match(/\.(png|jpe?g|webp|gif|heic|heif)$/i)
                    )
                  const isVideo =
                    !isAnimation && !isVideoNote && (
                      mime.startsWith('video/') || name.match(/\.(mp4|mov|mkv|webm)$/)
                    )
                  const isAudio =
                    mime.startsWith('audio/') || name.match(/\.(mp3|wav|ogg|m4a|oga)$/)
                  const isVoice = msg.type === 'voice' || msg.type === 'audio'
                  const key = `${msg.id}-${index}`
                  const expanded = expandedMedia[key] ?? false
                  return (
                    <div key={index} className="mt-2 text-xs text-white/60">
                      {src && (isSticker || isWebpSticker) && !isAnimatedSticker ? (
                        <div className="flex flex-col gap-2 items-start">
                          {failedStickers.has(key) ? (
                            <div className="h-24 w-24 flex items-center justify-center rounded-lg bg-white/5 text-white/40 text-[10px]">
                              Стикер
                            </div>
                          ) : (
                            <img
                              src={src}
                              alt="sticker"
                              className="h-24 w-24 object-contain"
                              loading="lazy"
                              onError={() => setFailedStickers(prev => new Set([...prev, key]))}
                            />
                          )}
                        </div>
                      ) : src && isAnimatedSticker ? (
                        <div className="flex flex-col gap-2 items-start">
                          <div className="h-24 w-24 flex items-center justify-center rounded-lg bg-white/5 text-white/40 text-[10px]">
                            Анимированный стикер
                          </div>
                        </div>
                      ) : src && isVideoNote ? (
                        <div className="flex flex-col gap-2">
                          <div className="relative inline-block">
                            <video
                              src={src}
                              controls
                              className={`rounded-2xl border border-white/10 ${
                                expanded
                                  ? 'max-h-[50vh] max-w-[60vw] w-auto h-auto'
                                  : 'max-h-36 max-w-[220px]'
                              }`}
                              onLoadedMetadata={scrollToBottom}
                            />
                            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/50 text-[9px] text-white/70">
                              🔵 Кружок
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMedia((prev) => ({ ...prev, [key]: !expanded }))
                              }
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              {expanded ? 'Свернуть' : 'Развернуть'}
                            </button>
                            <a
                              href={src}
                              download={att.name || 'video_note.mp4'}
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              Скачать
                            </a>
                          </div>
                        </div>
                      ) : src && isAnimation ? (
                        <div className="flex flex-col gap-2">
                          <video
                            src={src}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="max-h-36 max-w-[200px] rounded-lg"
                            onLoadedMetadata={scrollToBottom}
                          />
                        </div>
                      ) : src && isImage ? (
                        <div className="flex flex-col gap-2">
                          <img
                            src={src}
                            alt={att.name || 'image'}
                            className={`rounded-xl border border-white/10 cursor-pointer ${
                              expanded
                                ? 'max-h-[50vh] max-w-[60vw] w-auto h-auto object-contain'
                                : 'max-h-36 max-w-[220px] object-cover'
                            }`}
                            onClick={() => setLightboxSrc(src)}
                            loading="lazy"
                            onLoad={scrollToBottom}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setLightboxSrc(src)}
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              Открыть
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMedia((prev) => ({ ...prev, [key]: !expanded }))
                              }
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              {expanded ? 'Свернуть' : 'Развернуть'}
                            </button>
                            <a
                              href={src}
                              download={att.name || 'image.jpg'}
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              Скачать
                            </a>
                          </div>
                        </div>
                      ) : src && isVideo ? (
                        <div className="flex flex-col gap-2">
                          <video
                            src={src}
                            controls
                            className={`rounded-lg border border-white/10 ${
                              expanded
                                ? 'max-h-[50vh] max-w-[60vw] w-auto h-auto'
                                : 'max-h-36 max-w-[220px]'
                            }`}
                            onLoadedMetadata={scrollToBottom}
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <a
                              href={src}
                              download={att.name || 'video.mp4'}
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              Скачать
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedMedia((prev) => ({ ...prev, [key]: !expanded }))
                              }
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              {expanded ? 'Свернуть' : 'Развернуть'}
                            </button>
                          </div>
                        </div>
                      ) : src && (isAudio || isVoice) ? (
                        <AudioPlayer src={src} isVoice={isVoice} name={att.name} />
                      ) : src ? (
                        <a
                          href={src}
                          target="_blank"
                          rel="noreferrer"
                          className="underline text-white/70 hover:text-white"
                        >
                          📎 {att.name || 'Файл'}
                        </a>
                      ) : (
                        <span className="text-white/40">📎 {att.name || 'Вложение'}</span>
                      )}
                    </div>
                  )
                }
                const renderGrid = () => {
                  const count = media.length
                  const cols = count <= 2 ? 'grid-cols-2' : count <= 4 ? 'grid-cols-2' : 'grid-cols-3'
                  return (
                    <div className="mt-2">
                      <div className={`grid ${cols} gap-2`}>
                        {media.map((att, index) => {
                          if (!att) return null
                          const src = att.url || att.local_path
                          const mime = (att.mime || '').toLowerCase()
                          const isImage =
                            mime.startsWith('image/') ||
                            (att.name || '').toLowerCase().match(/\.(png|jpe?g|webp|gif)$/)
                          const isVideo =
                            mime.startsWith('video/') || (att.name || '').toLowerCase().match(/\.(mp4|mov|mkv|webm)$/)
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                if (!src) return
                                if (isImage) setLightboxSrc(src)
                                else if (isVideo) window.open(src, '_blank')
                              }}
                              className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5"
                              title="Открыть"
                            >
                              {isImage && src && (
                                <img
                                  src={src}
                                  alt={att.name || 'image'}
                                  className="h-24 w-full object-cover"
                                  loading="lazy"
                                />
                              )}
                              {isVideo && src && (
                                <>
                                  <video src={src} className="h-24 w-full object-cover" />
                                  <span className="absolute inset-0 flex items-center justify-center text-white/80">
                                    ▶
                                  </span>
                                </>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {media.map((att, index) => {
                          const src = att.url || att.local_path
                          return (
                            <a
                              key={index}
                              href={src}
                              download={att.name || `file_${index + 1}`}
                              className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10"
                            >
                              Скачать {index + 1}
                            </a>
                          )
                        })}
                      </div>
                    </div>
                  )
                }
                return (
                  <>
                    {media.length > 1 ? renderGrid() : media.length === 1 ? renderSingle(media[0], 0) : null}
                    {other.map((att, index) => renderSingle(att, index + media.length))}
                  </>
                )
              })()}
              {/* Inline Buttons */}
              {msg.inline_buttons && msg.inline_buttons.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5">
                  {msg.inline_buttons.map((row, rowIdx) => (
                    <div key={rowIdx} className="flex gap-1.5">
                      {row.map((btn, btnIdx) => (
                        <a
                          key={btnIdx}
                          href={btn.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 rounded-xl border border-ocean-500/30 bg-ocean-500/10 px-3 py-2 text-center text-xs text-ocean-300 hover:bg-ocean-500/20 transition"
                        >
                          {btn.text}
                        </a>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1 text-right text-[9px] text-white/40">
                {formatMsgTime(msg.created_at)}
              </div>
                </>
              )}
            </div>
              )
            })()
          ))}
        </div>
      </div>

        <div className="mt-4 border-t border-white/10 pt-4 pb-[env(safe-area-inset-bottom)]">
        {replyTo && (
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 flex items-center justify-between">
            <div className="truncate">
              Ответ на: {replyTo.text ? replyTo.text.slice(0, 120) : replyTo.type}
            </div>
            <button className="text-white/50 hover:text-white" onClick={() => setReplyTo(null)}>✕</button>
          </div>
        )}
        <div className="flex items-end gap-3">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            onChange={async (e) => {
              const files = e.target.files ? Array.from(e.target.files) : []
              await addFilesToPending(files)
              e.currentTarget.value = ''
            }}
          />
          <input
            ref={photoRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,video/*"
            onChange={async (e) => {
              const files = e.target.files ? Array.from(e.target.files) : []
              await addFilesToPending(files)
              e.currentTarget.value = ''
            }}
          />
          <div className="flex-1 relative" style={{ overflow: 'visible' }}>
            <div className="relative rounded-2xl bg-ink-800/80 px-4 pr-20 min-h-[56px] flex items-center">
              <button
                type="button"
                onClick={() => setAttachOpen((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full text-white/60 hover:bg-white/10 active:bg-white/20 cursor-pointer touch-manipulation"
                title="Прикрепить"
                disabled={!chat}
              >
                📎
              </button>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                rows={2}
                placeholder="Напишите ответ…"
                className="w-full resize-none bg-transparent text-sm focus:outline-none pl-12 leading-5 py-1.5"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  className="h-9 w-9 rounded-full text-white/60 hover:bg-white/10"
                  title="Эмодзи"
                >
                  🙂
                </button>
                <button
                  onClick={handleSend}
                  disabled={(!text.trim() && pendingAttachments.length === 0) || sending}
                  className={clsx(
                    'h-9 w-9 rounded-full text-sm font-semibold transition flex items-center justify-center',
                    sending || (!text.trim() && pendingAttachments.length === 0)
                      ? 'bg-white/10 text-white/40'
                      : 'bg-ocean-600 text-white hover:bg-ocean-500'
                  )}
                  title="Отправить"
                >
                  {sending ? '…' : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {pendingAttachments.length > 0 && (
              <div className="mt-2 max-h-24 overflow-y-auto scrollbar-thin">
                <div className="flex flex-col gap-1.5">
                  {pendingAttachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs min-w-0">
                      {((att.mime || att.upload?.mime || '').startsWith('image/') && (att.upload?.url || att.upload?.local_path)) && (
                        <img
                          src={att.upload?.url || att.upload?.local_path}
                          className="h-7 w-7 rounded-lg object-cover shrink-0"
                        />
                      )}
                      <span className="text-white/70 truncate flex-1 min-w-0">{att.name || att.upload?.name || 'file'}</span>
                      <button
                        className="text-white/40 hover:text-white shrink-0 ml-1"
                        onClick={() =>
                          setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Pending Buttons Preview */}
            {pendingButtons.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="text-[10px] text-white/40 uppercase tracking-wide">Кнопки под сообщением</div>
                {pendingAttachments.length > 1 && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                    <div className="flex items-center gap-2 text-xs text-amber-300">
                      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Кнопки не будут отправлены — Telegram не поддерживает кнопки при нескольких медиа</span>
                    </div>
                  </div>
                )}
                {pendingButtons.map((row, rowIndex) => (
                  <div key={rowIndex} className="flex flex-wrap gap-2">
                    {row.map((btn, btnIndex) => (
                      <div
                        key={btnIndex}
                        className="group flex items-center gap-1.5 rounded-xl border border-ocean-500/30 bg-ocean-500/10 px-3 py-1.5"
                      >
                        <span className="text-xs text-ocean-300">{btn.text}</span>
                        <button
                          onClick={() => {
                            const newButtons = pendingButtons.map((r, ri) =>
                              ri === rowIndex ? r.filter((_, bi) => bi !== btnIndex) : r
                            ).filter(r => r.length > 0)
                            setPendingButtons(newButtons)
                          }}
                          className="text-white/30 hover:text-rose-400 transition"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {/* Buttons Editor Modal */}
            {buttonsOpen && (
              <div className="absolute left-2 bottom-16 z-20 w-80 rounded-2xl border border-white/10 bg-ink-900/98 p-4 shadow-soft backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium text-white">Добавить URL кнопку</div>
                  <button
                    onClick={() => {
                      setButtonsOpen(false)
                      setNewButtonText('')
                      setNewButtonUrl('')
                    }}
                    className="text-white/40 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1.5">Текст кнопки</label>
                    <input
                      value={newButtonText}
                      onChange={(e) => setNewButtonText(e.target.value)}
                      placeholder="Открыть сайт"
                      className="w-full rounded-xl bg-ink-800/80 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-white/50 mb-1.5">URL ссылки</label>
                    <input
                      value={newButtonUrl}
                      onChange={(e) => setNewButtonUrl(e.target.value)}
                      placeholder="example.com или t.me/username"
                      className="w-full rounded-xl bg-ink-800/80 border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/50"
                    />
                    <div className="text-[10px] text-white/30 mt-1">Введите домен (google.com) или полный URL</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!newButtonText.trim() || !newButtonUrl.trim()) return
                        let url = newButtonUrl.trim()
                        if (!/^https?:\/\//i.test(url)) url = 'https://' + url
                        // Validate URL has domain with TLD
                        if (!/^https?:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,}/i.test(url)) {
                          alert('Укажите корректный URL с доменом (например: google.com, t.me/username)')
                          return
                        }
                        const newBtn: InlineButton = { text: newButtonText.trim(), url }
                        // Add to new row
                        setPendingButtons([...pendingButtons, [newBtn]])
                        setNewButtonText('')
                        setNewButtonUrl('')
                        setButtonsOpen(false)
                      }}
                      disabled={!newButtonText.trim() || !newButtonUrl.trim()}
                      className="flex-1 rounded-xl bg-ocean-500/20 border border-ocean-500/30 px-4 py-2 text-sm text-ocean-300 hover:bg-ocean-500/30 transition disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Добавить
                    </button>
                    {pendingButtons.length > 0 && (
                      <button
                        onClick={() => {
                          if (!newButtonText.trim() || !newButtonUrl.trim()) return
                          let url2 = newButtonUrl.trim()
                          if (!/^https?:\/\//i.test(url2)) url2 = 'https://' + url2
                          // Validate URL has domain with TLD
                          if (!/^https?:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.[a-zA-Z]{2,}/i.test(url2)) {
                            alert('Укажите корректный URL с доменом (например: google.com, t.me/username)')
                            return
                          }
                          const newBtn: InlineButton = { text: newButtonText.trim(), url: url2 }
                          // Add to last row
                          const newButtons = [...pendingButtons]
                          newButtons[newButtons.length - 1] = [...newButtons[newButtons.length - 1], newBtn]
                          setPendingButtons(newButtons)
                          setNewButtonText('')
                          setNewButtonUrl('')
                          setButtonsOpen(false)
                        }}
                        disabled={!newButtonText.trim() || !newButtonUrl.trim()}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 hover:bg-white/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Добавить в последний ряд"
                      >
                        + в ряд
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            {attachOpen && (
              <div
                ref={attachRef}
                className="absolute left-2 bottom-16 z-20 w-56 rounded-2xl border border-white/10 bg-ink-900/98 p-2 shadow-soft text-xs backdrop-blur-xl"
                style={{ overflow: 'visible' }}
              >
                <button
                  className="w-full rounded-xl px-3 py-3 text-left hover:bg-white/10 active:bg-white/20 touch-manipulation"
                  onClick={() => {
                    setAttachOpen(false)
                    photoRef.current?.click()
                  }}
                >
                  📷 Фото / Видео
                </button>
                <button
                  className="w-full rounded-xl px-3 py-3 text-left hover:bg-white/10 active:bg-white/20 touch-manipulation"
                  onClick={() => {
                    setAttachOpen(false)
                    fileRef.current?.click()
                  }}
                >
                  📄 Файл
                </button>
                <button
                  className={`w-full rounded-xl px-3 py-3 text-left touch-manipulation ${pendingAttachments.length > 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/10 active:bg-white/20'}`}
                  onClick={() => {
                    if (pendingAttachments.length > 1) return
                    setAttachOpen(false)
                    setButtonsOpen(true)
                  }}
                  disabled={pendingAttachments.length > 1}
                >
                  🔗 Добавить кнопку
                  {pendingAttachments.length > 1 && (
                    <div className="text-[10px] text-amber-400/70 mt-0.5">Недоступно при нескольких медиа</div>
                  )}
                </button>
                <div className="mt-2 rounded-xl border border-white/10 bg-white/5 p-2">
                  <div className="text-white/50 mb-1">Шаблоны</div>
                  {templates.length === 0 && <div className="text-white/40">Нет шаблонов</div>}
                  <div className="max-h-36 overflow-y-auto scrollbar-thin">
                    {templates.map((tpl) => (
                      <button
                        key={tpl.id}
                        className="w-full rounded-lg px-2 py-2 text-left hover:bg-white/10 active:bg-white/20 touch-manipulation"
                        onClick={() => {
                          setText(tpl.body || '')
                          // Apply attachments from template - convert to pending format
                          if (tpl.attachments && tpl.attachments.length > 0) {
                            const converted = tpl.attachments.map((att: any) => {
                              const mime = att.mime || ''
                              let type = 'document'
                              if (mime.startsWith('image/')) type = 'photo'
                              else if (mime.startsWith('video/')) type = 'video'
                              else if (mime.startsWith('audio/')) type = 'audio'
                              return {
                                upload: { url: att.url, local_path: att.local_path, mime: att.mime, name: att.name, size: att.size },
                                type,
                                name: att.name,
                                mime: att.mime
                              }
                            })
                            setPendingAttachments(converted)
                          }
                          // Apply inline buttons from template
                          if (tpl.inline_buttons && tpl.inline_buttons.length > 0) {
                            setPendingButtons(tpl.inline_buttons)
                          }
                          setAttachOpen(false)
                          inputRef.current?.focus()
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span>{tpl.title}</span>
                          {((tpl.attachments && tpl.attachments.length > 0) || (tpl.inline_buttons && tpl.inline_buttons.length > 0)) && (
                            <span className="text-[9px] text-white/40">
                              {tpl.attachments && tpl.attachments.length > 0 && `📎${tpl.attachments.length}`}
                              {tpl.inline_buttons && tpl.inline_buttons.length > 0 && ` 🔗`}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {emojiOpen && (
              <div
                ref={emojiRef}
                className="absolute right-2 bottom-16 z-10 w-64 max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-ink-900/95 p-3 shadow-soft"
              >
                <div className="grid grid-cols-8 gap-2 text-lg">
                  {emojiList.map((em) => (
                    <button
                      key={em}
                      className="rounded-lg hover:bg-white/10"
                      onClick={() => {
                        setText((prev) => `${prev}${em}`)
                        setEmojiOpen(false)
                        inputRef.current?.focus()
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="preview"
            className="max-h-[90vh] max-w-[90vw] rounded-2xl border border-white/10 shadow-soft"
          />
        </div>
      )}

      {confirmDelete && chat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 fade-in"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="rounded-2xl border border-white/10 bg-ink-900 shadow-soft p-5 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-medium mb-1">Удалить сообщение?</div>
            <div className="text-xs text-white/50 mb-4 truncate">
              {confirmDelete.text ? safeText(confirmDelete.text).slice(0, 80) : confirmDelete.type}
              {((confirmDelete.text?.length || 0) > 80) && '…'}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl border border-white/10 text-xs text-white/70 hover:bg-white/10"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!chat || !confirmDelete) return
                  setDeletingId(confirmDelete.id)
                  try {
                    await api.deleteMessage(chat.id, confirmDelete.id)
                    setConfirmDelete(null)
                    onMessageDeleted?.()
                  } catch {
                    setConfirmDelete(null)
                  } finally {
                    setDeletingId(null)
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-xs text-white hover:bg-rose-500"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
