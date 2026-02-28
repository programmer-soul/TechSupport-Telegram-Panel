import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
    <div className="flex w-[220px] max-w-full items-center gap-2 overflow-hidden rounded-xl bg-white/5 px-3 py-2 sm:w-[250px]">
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
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          className="h-1.5 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
          onClick={handleSeek}
        >
          <div
            className="h-full bg-ocean-400 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/55 tabular-nums">
          <span className="whitespace-nowrap">{formatTime(currentTime)}</span>
          <span className="whitespace-nowrap">{formatTime(duration)}</span>
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
  messagesLoading = false,
  hasMoreMessages = false,
  loadingMoreMessages = false,
  onLoadMoreMessages
}: {
  chat?: Chat
  messages: Message[]
  onMessageSent: (sent?: Message) => void
  onMessageDeleted?: () => void
  highlight?: string
  templates?: { id: number; title: string; body: string; attachments?: any[] | null; inline_buttons?: { text: string; url: string }[][] | null }[]
  onBack?: () => void
  onShowProfile?: () => void
  onChatUpdated?: (patch: Partial<Chat>) => void
  userRole?: 'administrator' | 'moderator' | null
  messagesLoading?: boolean
  hasMoreMessages?: boolean
  loadingMoreMessages?: boolean
  onLoadMoreMessages?: () => void
}) {
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const safeText = (value?: unknown) => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
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
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [failedStickers, setFailedStickers] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  const [showOpenLoader, setShowOpenLoader] = useState(false)
  const [holdOpenLoader, setHoldOpenLoader] = useState(false)
  const [contentReady, setContentReady] = useState(true)
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
  const bottomSnapRafRef = useRef<number | null>(null)
  const suppressEnterAnimUntilRef = useRef<number>(0)
  const lastCountRef = useRef(0)
  const lastChatRef = useRef<string | undefined>(undefined)
  const contentShownForChatRef = useRef<string | undefined>(undefined)
  const sawMessagesLoadingForChatRef = useRef(false)
  const loaderHoldTimerRef = useRef<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const topLoaderRef = useRef<HTMLDivElement>(null)
  const prevScrollHeightRef = useRef<number>(0)
  const noteBlockRef = useRef<HTMLDivElement>(null)
  const deliveryBlocked = Boolean(chat?.bot_blocked || chat?.admin_blocked)
  const blockedReason = String(chat?.bot_blocked_reason || '').toLowerCase()
  const blockedText =
    chat?.admin_blocked
      ? 'Клиент заблокирован администратором'
      : blockedReason === 'blocked'
        ? 'Пользователь заблокировал бота'
        : blockedReason === 'stopped_or_never_started'
          ? 'Пользователь остановил бота'
          : blockedReason === 'deactivated'
            ? 'Аккаунт пользователя деактивирован'
            : 'Пользователь недоступен для сообщений'
  const isInitialMessagesLoad = Boolean(chat?.id && messagesLoading && contentShownForChatRef.current !== chat.id)
  const hasShownCurrentChat = Boolean(chat?.id && contentShownForChatRef.current === chat.id)
  const openingPhase = Boolean(chat && !hasShownCurrentChat && (!contentReady || showOpenLoader || isInitialMessagesLoad || holdOpenLoader))
  const getOpenLoaderDelay = () => {
    if (typeof window === 'undefined') return 220
    const mobileViewport = window.matchMedia('(max-width: 768px)').matches
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches
    return mobileViewport || coarsePointer ? 360 : 220
  }

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

  // Keep bottom anchored without multiple hard jumps when media loads in bursts.
  const scheduleBottomSnap = () => {
    if (bottomSnapRafRef.current) return
    bottomSnapRafRef.current = requestAnimationFrame(() => {
      bottomSnapRafRef.current = null
      const el = listRef.current
      if (!el) return
      if (!stickToBottom && Date.now() >= keepScrollingUntilRef.current) return
      el.scrollTop = el.scrollHeight
    })
  }

  // Helper for media callbacks
  const scrollToBottom = () => {
    const el = listRef.current
    if (!el) return
    scheduleBottomSnap()
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
    return () => {
      if (bottomSnapRafRef.current) {
        cancelAnimationFrame(bottomSnapRafRef.current)
        bottomSnapRafRef.current = null
      }
      if (loaderHoldTimerRef.current) {
        window.clearTimeout(loaderHoldTimerRef.current)
        loaderHoldTimerRef.current = null
      }
    }
  }, [])

  useLayoutEffect(() => {
    if (!chat?.id) {
      setContentReady(true)
      return
    }
    setContentReady(false)
    contentShownForChatRef.current = undefined
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
    suppressEnterAnimUntilRef.current = Date.now() + 1200
    sawMessagesLoadingForChatRef.current = false
    setHoldOpenLoader(true)
  }, [chat?.id])

  useEffect(() => {
    if (!chat?.id) return
    if (messagesLoading) {
      sawMessagesLoadingForChatRef.current = true
    }
  }, [chat?.id, messagesLoading])

  useEffect(() => {
    if (!chat?.id) return
    if (messagesLoading) return
    if (messages.length > 0) {
      // Allow top IntersectionObserver pagination after initial batch is rendered.
      initialLoadRef.current = false
    }
  }, [chat?.id, messagesLoading, messages.length])

  useEffect(() => {
    if (!chat?.id) {
      setShowOpenLoader(false)
      return
    }
    setShowOpenLoader(true)
    const t = window.setTimeout(() => {
      setShowOpenLoader(false)
    }, getOpenLoaderDelay())
    return () => window.clearTimeout(t)
  }, [chat?.id])

  useEffect(() => {
    if (loaderHoldTimerRef.current) {
      window.clearTimeout(loaderHoldTimerRef.current)
      loaderHoldTimerRef.current = null
    }
    if (!chat?.id) {
      setHoldOpenLoader(false)
      return
    }
    // Keep hold only during initial open of a chat.
    // Subsequent background refreshes (e.g. after sending) must not hide the chat.
    if (!contentReady || isInitialMessagesLoad || showOpenLoader) {
      setHoldOpenLoader(true)
      return
    }
    // Keep loader visible for a short final beat after content is ready,
    // so transition feels smooth and avoids post-loader flicker.
    loaderHoldTimerRef.current = window.setTimeout(() => {
      // Final snap before reveal to hide residual post-loader drift.
      scheduleBottomSnap()
      setHoldOpenLoader(false)
      loaderHoldTimerRef.current = null
    }, 320)
    return () => {
      if (loaderHoldTimerRef.current) {
        window.clearTimeout(loaderHoldTimerRef.current)
        loaderHoldTimerRef.current = null
      }
    }
  }, [chat?.id, contentReady, isInitialMessagesLoad, showOpenLoader])

  useEffect(() => {
    if (!chat?.id) {
      setContentReady(true)
      return
    }
    // Do not reveal content before we have observed at least one real loading
    // cycle for this chat; otherwise we can briefly show an empty panel and
    // then repaint, which looks like flicker.
    if (!sawMessagesLoadingForChatRef.current && messages.length === 0) return
    if (messagesLoading) return
    // Already properly revealed for this chat (with real messages) — don't
    // interfere with subsequent incoming WS messages or re-renders.
    if (contentShownForChatRef.current === chat.id) return
    const el = listRef.current
    if (!el) {
      setContentReady(true)
      return
    }
    // If messages haven't arrived yet, wait for them (avoids top→bottom flicker
    // when messagesLoading flips false before the message list is populated).
    // Do NOT mark contentShownForChatRef here so the effect re-runs once
    // messages do arrive and can snap properly to the bottom.
    if (messages.length === 0) {
      const t = window.setTimeout(() => setContentReady(true), 350)
      return () => window.clearTimeout(t)
    }

    // Keep content hidden until the scroll height has been stable for
    // STABLE_MS. Poll el.scrollHeight directly so we don't depend on
    // firstElementChild (which is the sticky "Add comment" button, not the
    // messages wrapper, causing ResizeObserver to miss image-load events).
    el.scrollTop = el.scrollHeight
    let lastHeight = el.scrollHeight
    let stableMs = 0
    const POLL_MS = 50
    const STABLE_MS = 360
    const MAX_HIDDEN_MS = 2600

    const revealContent = () => {
      clearInterval(pollInterval)
      window.clearTimeout(maxTimer)
      contentShownForChatRef.current = chat.id
      el.scrollTop = el.scrollHeight
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setContentReady(true)
        })
      })
    }

    const show = () => {
      const images = Array.from(el.querySelectorAll('img[data-chat-media="1"]')) as HTMLImageElement[]
      const videos = Array.from(el.querySelectorAll('video[data-chat-media="1"]')) as HTMLVideoElement[]
      const pendingImages = images.filter((img) => !img.complete)
      const pendingVideos = videos.filter((video) => video.readyState < 1)
      const pendingTotal = pendingImages.length + pendingVideos.length
      if (pendingTotal === 0) {
        revealContent()
        return
      }

      let resolved = 0
      let finished = false
      const cleanups: Array<() => void> = []
      const done = () => {
        if (finished) return
        resolved += 1
        if (resolved >= pendingTotal) {
          finished = true
          cleanups.forEach((fn) => fn())
          revealContent()
        }
      }

      for (const img of pendingImages) {
        const onLoad = () => done()
        const onError = () => done()
        img.addEventListener('load', onLoad, { once: true })
        img.addEventListener('error', onError, { once: true })
        cleanups.push(() => {
          img.removeEventListener('load', onLoad)
          img.removeEventListener('error', onError)
        })
      }

      for (const video of pendingVideos) {
        const onMeta = () => done()
        const onError = () => done()
        video.addEventListener('loadedmetadata', onMeta, { once: true })
        video.addEventListener('error', onError, { once: true })
        cleanups.push(() => {
          video.removeEventListener('loadedmetadata', onMeta)
          video.removeEventListener('error', onError)
        })
      }

      const fallback = window.setTimeout(() => {
        if (finished) return
        finished = true
        cleanups.forEach((fn) => fn())
        revealContent()
      }, 1200)
      cleanups.push(() => window.clearTimeout(fallback))
    }

    const pollInterval = setInterval(() => {
      const h = el.scrollHeight
      if (h !== lastHeight) {
        lastHeight = h
        stableMs = 0
        el.scrollTop = el.scrollHeight
      } else {
        stableMs += POLL_MS
        if (stableMs >= STABLE_MS) show()
      }
    }, POLL_MS)

    const maxTimer = window.setTimeout(show, MAX_HIDDEN_MS)

    return () => {
      clearInterval(pollInterval)
      window.clearTimeout(maxTimer)
    }
  }, [chat?.id, messagesLoading, messages.length])

  useEffect(() => {
    // Prevent entry animation flicker right after initial chat loading finishes.
    if (chat && !showOpenLoader && !messagesLoading && !holdOpenLoader) {
      suppressEnterAnimUntilRef.current = Date.now() + 900
    }
  }, [chat?.id, showOpenLoader, messagesLoading, holdOpenLoader])

  useEffect(() => {
    if (!openingPhase) return
    // While loading a chat, keep viewport pinned to the latest messages.
    scheduleBottomSnap()
    const t = window.setInterval(() => {
      scheduleBottomSnap()
    }, 60)
    return () => window.clearInterval(t)
  }, [openingPhase])

  useEffect(() => {
    if (!chat || openingPhase) return
    // Final stabilization after loader is gone (late media/layout updates).
    scheduleBottomSnap()
    const t = window.setTimeout(() => {
      scheduleBottomSnap()
    }, 180)
    return () => window.clearTimeout(t)
  }, [chat?.id, openingPhase, messages.length])

  useEffect(() => {
    if (!chat || deliveryBlocked) return
    const timer = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [chat?.id, deliveryBlocked])

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

  // Watch content size changes and keep bottom anchored while user is at bottom
  // (and for a short warm-up window after opening chat).
  // Poll el.scrollHeight instead of using ResizeObserver on firstElementChild,
  // because the first child is the sticky note/comment button, not the messages
  // wrapper — so ResizeObserver would miss image-load layout changes.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    let lastHeight = el.scrollHeight
    const id = setInterval(() => {
      const newHeight = el.scrollHeight
      if (newHeight !== lastHeight && (stickToBottom || Date.now() < keepScrollingUntilRef.current)) {
        lastHeight = newHeight
        el.scrollTop = el.scrollHeight
        scheduleBottomSnap()
      }
    }, 50)
    return () => clearInterval(id)
  }, [chat?.id, stickToBottom])

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
    if (!noteEditing) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!noteBlockRef.current) return
      if (!noteBlockRef.current.contains(event.target as Node)) {
        setNoteEditing(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [noteEditing])

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
    if (!deleteError) return
    const t = window.setTimeout(() => setDeleteError(null), 3500)
    return () => window.clearTimeout(t)
  }, [deleteError])

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

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const chatId = chat?.id
    const count = messages.length
    const chatChanged = chatId !== lastChatRef.current
    const countChanged = count !== lastCountRef.current

    if (chatChanged) {
      lastChatRef.current = chatId
      lastCountRef.current = count
      el.scrollTop = el.scrollHeight
      return
    }

    lastCountRef.current = count
    if (!stickToBottom || !countChanged) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
      smoothScrollRef.current = false
    })
  }, [messages.length, chat?.id, stickToBottom])

  useEffect(() => {
    messages.forEach((m) => {
      if (m.id) seenRef.current.add(m.id)
    })
  }, [messages])

  // Virtualization can cause visible reflow/flicker on rapid outgoing updates.
  // Keep it effectively disabled until we rework the virtualization pipeline.
  const useVirtual = messages.length > 2000
  const orderedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      const left = typeof (a as any).sort_order === 'number' ? (a as any).sort_order : a.id
      const right = typeof (b as any).sort_order === 'number' ? (b as any).sort_order : b.id
      return left - right
    })
  }, [templates])
  const replyByTelegramMessageId = useMemo(() => {
    const map = new Map<number, Message>()
    for (const message of messages) {
      if (typeof message.telegram_message_id === 'number') {
        map.set(message.telegram_message_id, message)
      }
    }
    return map
  }, [messages])
  const virtual = useMemo(() => {
    const ESTIMATE = 96
    const total = messages.length
    if (!viewportHeight || !useVirtual) {
      return { items: messages, paddingTop: 0, paddingBottom: 0, offset: 0 }
    }
    const estimatedBottomScrollTop = Math.max(0, total * ESTIMATE - viewportHeight)
    const effectiveScrollTop = stickToBottom && scrollTop === 0 ? estimatedBottomScrollTop : scrollTop
    const start = Math.max(0, Math.floor(effectiveScrollTop / ESTIMATE) - 12)
    const end = Math.min(total, Math.ceil((effectiveScrollTop + viewportHeight) / ESTIMATE) + 12)
    return {
      items: messages.slice(start, end),
      paddingTop: start * ESTIMATE,
      paddingBottom: Math.max(0, (total - end) * ESTIMATE),
      offset: start
    }
  }, [messages, scrollTop, viewportHeight, useVirtual, stickToBottom])

  const handleSend = async () => {
    const hasText = text.trim().length > 0
    if (!chat || deliveryBlocked || (!hasText && pendingAttachments.length === 0)) return
    const textToSend = text
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
      const sent = await api.sendMessage(chat.id, {
        text: hasText ? textToSend : undefined,
        type: firstType,
        attachments: attachmentsToSend.map((a) => a.upload),
        inline_buttons: buttonsToSend,
        reply_to_message_id: replyToId
      })
      smoothScrollRef.current = true
      onMessageSent(sent)
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
      <div className="flex items-center justify-between border-b border-white/10 pb-2 sm:pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-base sm:text-lg font-display font-semibold">
            {onBack && (
              <button
                onClick={onBack}
                className="xl:hidden h-7 w-7 rounded-full text-white/70 hover:bg-white/10 shrink-0"
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
        {chat && userRole === 'administrator' && (
          <button
            type="button"
            onClick={() => setDeleteMode((v) => !v)}
            className={clsx(
              'sm:hidden order-1 ml-2 h-7 w-7 rounded-full border text-xs flex items-center justify-center shrink-0',
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
        {onShowProfile && chat && (
          <button
            onClick={onShowProfile}
            className="xl:hidden order-2 ml-2 h-7 w-7 rounded-full border border-white/10 text-white/70 hover:bg-white/10 shrink-0 flex items-center justify-center"
            aria-label="Информация"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M12 16v-4m0-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        )}
      </div>

      <div className="mt-3 px-1 h-1 pointer-events-none">
        <div
          className={clsx(
            'chat-open-loader transition-opacity duration-150',
            chat && !hasShownCurrentChat && (!contentReady || showOpenLoader || isInitialMessagesLoad || holdOpenLoader) ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>
      <div
        ref={listRef}
        className={clsx(
          'flex-1 min-h-0 overflow-y-auto scrollbar-thin mt-4 pr-2 no-anchor transition-opacity duration-100',
          contentReady && !openingPhase ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
        )}
        onScroll={() => {
          const el = listRef.current
          if (!el) return
          if (openingPhase) {
            setStickToBottom(true)
            if (useVirtual) setScrollTop(0)
            return
          }
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
          setStickToBottom(atBottom)
          if (useVirtual) setScrollTop(el.scrollTop)
        }}
      >
        {chat && (noteText.trim() || noteEditing) && (
          <div ref={noteBlockRef} className="sticky top-0 z-10 mb-3 rounded-2xl border border-white/10 bg-ink-900/80 backdrop-blur px-4 py-3 text-xs text-white/80 shadow-soft">
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
              {!noteEditing && (
                <button
                  type="button"
                  onClick={() => setNoteEditing(true)}
                  className="rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/70 hover:bg-white/10"
                >
                  Редактировать
                </button>
              )}
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
          <div className="sticky top-0 z-10 mb-3 flex justify-center">
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 backdrop-blur px-4 py-2.5 flex items-center gap-3 max-w-full">
              <span className="text-xs text-rose-200 whitespace-nowrap">Нажмите на сообщение для удаления</span>
              <button
                type="button"
                onClick={() => setDeleteMode(false)}
                className="shrink-0 rounded-full border border-white/10 px-3 py-1 text-[10px] text-white/70 hover:bg-white/10"
              >
                Выйти
              </button>
            </div>
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
        {chat && messages.length === 0 && !loadingMoreMessages && !messagesLoading && !openingPhase && (
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
                ? replyByTelegramMessageId.get(msg.reply_to_telegram_message_id)
                : undefined
              const senderLabel =
                msg.type === 'system'
                  ? 'Системное'
                  : msg.direction === 'IN'
                    ? safeText(chat?.first_name || chat?.tg_username || 'Пользователь')
                    : 'Вы'
              const hasTextContent = Boolean(safeText(msg.text).trim())
              const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0)
              const isStickerOnly = msg.type === 'sticker' && hasAttachments && !hasTextContent
              const hasVisualMediaMessage = ['photo', 'video', 'animation', 'sticker', 'video_note'].includes(msg.type)
              const hasMediaGroupCaption = Boolean(
                hasTextContent && hasVisualMediaMessage && (msg.attachments?.length || 0) > 1
              )
              const msgCreatedAt = msg.created_at ? new Date(msg.created_at).getTime() : NaN
              const withinTelegramDeleteWindow =
                Number.isFinite(msgCreatedAt) && Date.now() - msgCreatedAt <= 48 * 60 * 60 * 1000
              const hasTelegramDeleteId =
                Boolean(msg.telegram_message_id) ||
                Boolean((msg.attachments || []).some((att: any) => {
                  const meta = att?.meta
                  const value = meta?.telegram_message_id
                  return typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))
                }))
              const canDeleteMessage = withinTelegramDeleteWindow && hasTelegramDeleteId
              const isNew =
                Date.now() > suppressEnterAnimUntilRef.current &&
                !initialLoadRef.current &&
                !seenRef.current.has(msg.id)
              return (
            <div
              key={msg.id}
              className={clsx(
                msg.type === 'system'
                  ? 'self-center rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-white/60 flex items-center gap-1'
                  : 'group w-full flex ' + (msg.direction === 'OUT' ? 'justify-end' : 'justify-start'),
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
                </div>
              ) : (
                <>
              <div className={clsx('flex items-start gap-2 max-w-full', msg.direction === 'OUT' && 'flex-row-reverse')}>
              <div
                className={clsx(
                  'rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-2 text-base sm:text-sm leading-relaxed',
                  msg.direction === 'OUT'
                    ? 'bg-ocean-600/20 border border-ocean-500/20'
                    : 'bg-white/5 border border-white/10',
                  isStickerOnly
                    ? 'min-w-[156px] sm:min-w-[172px] max-w-[190px] sm:max-w-[210px]'
                    : msg.attachments && msg.attachments.length > 0
                    ? hasVisualMediaMessage
                      ? 'max-w-[88vw] sm:max-w-[520px]'
                      : 'max-w-[90%] sm:max-w-[72%]'
                    : 'max-w-[85%] sm:max-w-[75%]',
                  isStickerOnly && 'px-3 py-2.5'
                )}
              >
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
              {msg.text && !hasMediaGroupCaption ? (
                <div className="whitespace-pre-wrap break-words">
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
              ) : !hasMediaGroupCaption && msg.type === 'location' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">📍</span>
                  <span>Геопозиция</span>
                </div>
              ) : !hasMediaGroupCaption && msg.type === 'contact' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">👤</span>
                  <span>Контакт</span>
                </div>
              ) : !hasMediaGroupCaption && msg.type === 'venue' ? (
                <div className="flex items-center gap-2 text-white/70">
                  <span className="text-base">📍</span>
                  <span>Место на карте</span>
                </div>
              ) : !hasMediaGroupCaption && msg.type === 'poll' ? (
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
                  const isVideoSticker = isSticker && (mime === 'video/webm' || name.endsWith('.webm'))
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
                    <div key={index} className={clsx('mt-2 text-xs text-white/60', isStickerOnly && 'flex justify-center')}>
                      {src && (isSticker || isWebpSticker) && !isAnimatedSticker && !isVideoSticker ? (
                        <div className="flex flex-col gap-2 items-start">
                          {failedStickers.has(key) ? (
                            <div className="h-24 w-24 flex flex-col items-center justify-center rounded-lg bg-white/5 text-white/40 text-[10px] gap-1">
                              <span>Стикер</span>
                              {src && (
                                <a
                                  href={src}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] underline text-white/60"
                                >
                                  Открыть
                                </a>
                              )}
                            </div>
                          ) : (
                            <img
                              src={src}
                              alt="sticker"
                              className="h-24 w-24 object-contain"
                              data-chat-media="1"
                              loading="lazy"
                              onError={() => setFailedStickers(prev => new Set([...prev, key]))}
                            />
                          )}
                        </div>
                      ) : src && isVideoSticker ? (
                        <div className="flex flex-col gap-2 items-start">
                          <video
                            src={src}
                            autoPlay
                            loop
                            muted
                            playsInline
                            controls
                            className="h-24 w-24 rounded-lg border border-white/10 object-contain bg-white/5"
                          />
                        </div>
                      ) : src && isAnimatedSticker ? (
                        <div className="flex flex-col gap-2 items-start">
                          <img
                            src={src}
                            alt="animated sticker preview"
                            className="h-24 w-24 object-contain rounded-lg bg-white/5"
                            data-chat-media="1"
                            loading="lazy"
                            onError={() => setFailedStickers(prev => new Set([...prev, key]))}
                          />
                        </div>
                      ) : isAnimatedSticker ? (
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
                              data-chat-media="1"
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
                            data-chat-media="1"
                            onLoadedMetadata={scrollToBottom}
                          />
                        </div>
                      ) : src && isImage ? (
                        <div className="flex flex-col gap-2">
                          <img
                            src={src}
                            alt={att.name || 'image'}
                            className="rounded-xl cursor-pointer w-full max-w-full max-h-[56vh] object-contain bg-black/10"
                            onClick={() => setLightboxSrc(src)}
                            data-chat-media="1"
                            loading="lazy"
                            onLoad={scrollToBottom}
                          />
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
                            data-chat-media="1"
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
                  const gridClass = count === 1 ? 'grid-cols-1' : count === 2 ? 'grid-cols-2' : 'grid-cols-3'
                  return (
                    <div className="mt-2 w-full max-w-full">
                      <div className={`grid ${gridClass} gap-1 overflow-hidden rounded-xl`}>
                        {media.map((att, index) => {
                          if (!att) return null
                          const src = att.url || att.local_path
                          const mime = (att.mime || '').toLowerCase()
                          const isImage =
                            mime.startsWith('image/') ||
                            (att.name || '').toLowerCase().match(/\.(png|jpe?g|webp|gif|tgs)$/)
                          const isVideo =
                            mime.startsWith('video/') || (att.name || '').toLowerCase().match(/\.(mp4|mov|mkv|webm)$/)
                          const isStickerTile = msg.type === 'sticker' || mime === 'image/webp'
                          const tileClass = 'relative overflow-hidden bg-black/10 aspect-square'
                          return (
                            <button
                              key={index}
                              type="button"
                              onClick={() => {
                                if (!src) return
                                if (isImage) setLightboxSrc(src)
                                else if (isVideo) window.open(src, '_blank')
                              }}
                              className={tileClass}
                              title="Открыть"
                            >
                              {isImage && src && (
                                <img
                                  src={src}
                                  alt={att.name || 'image'}
                                  className={clsx('h-full w-full', isStickerTile ? 'object-contain bg-white/[0.03]' : 'object-cover')}
                                  data-chat-media="1"
                                  loading="lazy"
                                />
                              )}
                              {isVideo && src && (
                                <>
                                  <video src={src} className="h-full w-full object-cover" data-chat-media="1" />
                                  <span className="absolute inset-0 flex items-center justify-center text-white/80">
                                    ▶
                                  </span>
                                </>
                              )}
                            </button>
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
              {msg.text && hasMediaGroupCaption && (
                <div className="mt-2 whitespace-pre-wrap break-words">
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
              )}
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
              </div>
              <div
                className={clsx(
                  'shrink-0 pt-1',
                  deleteMode && canDeleteMessage
                    ? ''
                    : 'hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity'
                )}
              >
                {deleteMode && canDeleteMessage ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(msg)}
                    disabled={deletingId === msg.id}
                    className="flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-1 text-[10px] text-rose-200 shadow-soft hover:bg-rose-500/30 disabled:opacity-50"
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
                      'flex items-center gap-1 rounded-full border border-white/10 bg-ink-900/90 px-2 py-1 text-[10px] text-white/70 shadow-soft',
                      !msg.telegram_message_id && 'opacity-50 cursor-not-allowed'
                    )}
                    disabled={!msg.telegram_message_id}
                    title="Ответить"
                  >
                    ↩
                  </button>
                )}
              </div>
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
        {chat && deliveryBlocked && (
          <div className="mb-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {blockedText}. Отправка из панели отключена.
          </div>
        )}
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
                disabled={!chat || deliveryBlocked}
              >
                📎
              </button>
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  if (e.nativeEvent.isComposing) return
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault()
                    const target = e.currentTarget
                    const start = target.selectionStart ?? text.length
                    const end = target.selectionEnd ?? text.length
                    const nextText = `${text.slice(0, start)}\n${text.slice(end)}`
                    setText(nextText)
                    requestAnimationFrame(() => {
                      target.selectionStart = target.selectionEnd = start + 1
                    })
                    return
                  }
                  if (e.shiftKey) return
                  e.preventDefault()
                  if (!deliveryBlocked && !sending && (text.trim() || pendingAttachments.length > 0)) {
                    void handleSend()
                  }
                }}
                rows={2}
                placeholder={deliveryBlocked ? `${blockedText}.` : 'Напишите ответ…'}
                disabled={deliveryBlocked}
                className="w-full resize-none bg-transparent text-base sm:text-sm focus:outline-none pl-12 leading-6 py-1.5"
              />
              <div className="absolute right-2 bottom-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEmojiOpen((v) => !v)}
                  className="h-9 w-9 rounded-full text-white/60 hover:bg-white/10"
                  title="Эмодзи"
                  disabled={deliveryBlocked}
                >
                  🙂
                </button>
                <button
                  onClick={handleSend}
                  disabled={deliveryBlocked || (!text.trim() && pendingAttachments.length === 0) || sending}
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
                  {orderedTemplates.length === 0 && <div className="text-white/40">Нет шаблонов</div>}
                  <div className="max-h-36 overflow-y-auto scrollbar-thin">
                    {orderedTemplates.map((tpl) => (
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
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 h-9 w-9 rounded-full border border-white/20 bg-black/40 text-white/80"
            aria-label="Закрыть"
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt="preview"
            className="h-[96vh] w-[96vw] object-contain rounded-xl border border-white/10 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {confirmDelete && chat && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 fade-in"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="rounded-2xl border border-white/10 bg-ink-900 shadow-soft p-5 w-auto max-w-[420px] min-w-[280px]"
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
                  } catch (err: any) {
                    setDeleteError(err?.message || 'Не удалось удалить сообщение')
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
      {deleteError && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-rose-500/35 bg-rose-500/20 px-3 py-2 text-xs text-rose-100">
          {deleteError}
        </div>
      )}
    </div>
  )
}
