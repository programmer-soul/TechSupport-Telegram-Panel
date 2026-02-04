import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { Chat } from '../lib/api'

const statusBadge: Record<string, string> = {
  NEW: 'bg-ocean-600/20 text-ocean-500 border-ocean-500/30',
  ACTIVE: 'bg-white/10 text-white/80 border-white/10',
  CLOSED: 'bg-white/5 text-white/50 border-white/10',
  ESCALATED: 'bg-gold-500/20 text-gold-300 border-gold-500/30'
}

const statusLabel: Record<string, string> = {
  NEW: 'Новый',
  ACTIVE: 'Активный',
  CLOSED: 'Закрыт',
  ESCALATED: 'У админа'
}

const safeText = (value?: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.replace(/<[^>]*>/g, '')
  return String(value)
}

const truncate = (value: string, max = 28) => {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const formatListTime = (iso?: string | null) => {
  if (!iso) return '—'
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

export default function ChatList({
  chats,
  selectedId,
  onSelect,
  hasMore = false,
  loadingMore = false,
  onLoadMore
}: {
  chats: Chat[]
  selectedId?: string
  onSelect: (chat: Chat) => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}) {
  const loaderRef = useRef<HTMLDivElement>(null)

  // Infinite scroll with IntersectionObserver
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    const el = loaderRef.current
    if (el) observer.observe(el)

    return () => {
      if (el) observer.unobserve(el)
    }
  }, [hasMore, loadingMore, onLoadMore])

  return (
    <div className="flex flex-col gap-3">
      {chats.map((chat) => (
        <button
          key={chat.id}
          onClick={() => onSelect(chat)}
          className={clsx(
            'relative card text-left p-4 hover:-translate-y-0.5 hover:shadow-glow transition-transform',
            selectedId === chat.id
              ? 'ring-1 ring-ocean-500/50 bg-ocean-600/10 shadow-glow'
              : 'bg-white/[0.03]'
          )}
        >
          {selectedId === chat.id && (
            <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full bg-ocean-500" />
          )}
          <div className="flex items-center justify-between">
            <div className="text-sm font-display font-semibold">
              {truncate(safeText(chat.first_name || 'Пользователь'), 22)}
              <span className="text-white/50 ml-2">{truncate(`@${safeText(chat.tg_username || 'unknown')}`, 18)}</span>
            </div>
            {chat.unread_count > 0 && (
              <span className="text-xs bg-ocean-600 text-white px-2 py-0.5 rounded-full">
                {chat.unread_count}
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-white/50 truncate">
            {truncate(safeText(chat.last_message_preview || ''), 46) || '—'}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap text-xs text-white/50">
            <span className={clsx('px-2 py-0.5 rounded-full border whitespace-nowrap', statusBadge[chat.status])}>
              {statusLabel[chat.status] || chat.status}
            </span>
            <span>{formatListTime(chat.last_message_at)}</span>
          </div>
        </button>
      ))}

      {/* Loading more indicator */}
      {hasMore && (
        <div ref={loaderRef} className="py-4 flex justify-center">
          {loadingMore ? (
            <div className="flex items-center gap-2 text-white/40 text-xs">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Загрузка...
            </div>
          ) : (
            <div className="text-white/20 text-xs">Прокрутите для загрузки</div>
          )}
        </div>
      )}
    </div>
  )
}
