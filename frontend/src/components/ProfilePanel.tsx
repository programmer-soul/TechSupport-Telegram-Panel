import { useEffect, useRef, useState } from 'react'
import { api, Chat, ExternalProfile } from '../lib/api'

const formatDate = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  return isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU')
}

const formatEpoch = (value?: number | null) => {
  if (!value && value !== 0) return '—'
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return '—'
  const ms = num > 10_000_000_000 ? num : num * 1000
  const date = new Date(ms)
  return isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU')
}

const formatRubles = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') return '—'
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  return `${num.toLocaleString('ru-RU')} ₽`
}

const formatGbNumber = (value?: number | null) => {
  if (value === null || value === undefined) return '0.0'
  const num = Number(value)
  if (!Number.isFinite(num)) return '0.0'
  const fixed = num.toFixed(2)
  const trimmed = fixed.replace(/(\.\d*?[1-9])0+$/, '$1')
  if (trimmed.endsWith('.00')) return `${trimmed.slice(0, -3)}.0`
  if (trimmed.endsWith('.')) return `${trimmed}0`
  return trimmed
}

const normalizeTrafficToGb = (value?: number | null) => {
  if (value === null || value === undefined) return 0
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return 0
  // Backward compatibility: some sources still return bytes.
  return num > 1_000_000 ? num / 1073741824 : num
}

const formatTraffic = (used?: number | null, limit?: number | null) => {
  const usedGb = normalizeTrafficToGb(used || 0)
  const limitGb = normalizeTrafficToGb(limit || 0)
  if (!limit || Number(limit) <= 0 || limitGb <= 0) return `${formatGbNumber(usedGb)} GB / Безлимит`
  return `${formatGbNumber(usedGb)} GB / ${formatGbNumber(limitGb)} GB`
}

const formatTrial = (value?: unknown) => {
  if (value === null || value === undefined || value === '') return '—'
  const numeric = Number(value)
  if (!Number.isNaN(numeric)) {
    if (numeric === 1) return 'использовал'
    if (numeric === 0) return 'не использовал'
    if (numeric === -1) return 'не использовал, доп дни'
  }
  const normalized = String(value).trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'used') return 'использовал'
  if (normalized === '0' || normalized === 'false' || normalized === 'not_used') return 'не использовал'
  if (normalized === '-1' || normalized === 'extra_days' || normalized === 'extra') return 'не использовал, доп дни'
  return String(value)
}

const formatRemaining = (expiry?: number | null) => {
  if (!expiry) return ''
  const ms = Number(expiry) > 10_000_000_000 ? Number(expiry) : Number(expiry) * 1000
  const diff = ms - Date.now()
  if (diff <= 0) return ' (истёк)'
  const totalHours = Math.floor(diff / 3600000)
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  return ` (${days} дн. ${hours} ч.)`
}

const statusLabel: Record<string, string> = {
  NEW: 'Новый',
  ACTIVE: 'Активный',
  CLOSED: 'Закрыт',
  ESCALATED: 'Передан администратору'
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5">
    <div className="text-[15px] font-semibold text-white/95 mb-2.5">{title}</div>
    <div className="space-y-1.5 text-[13px] leading-5 text-white/78">{children}</div>
  </div>
)

const Line = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <span className="text-white/55">{label}: </span>
    <span className="text-white/88 font-medium">{value}</span>
  </div>
)

export default function ProfilePanel({
  chat,
  onBack,
  solobotUsername,
  panelMode,
  onChatUpdated,
  onMessagesRefresh
}: {
  chat?: Chat
  onBack?: () => void
  userRole?: 'administrator' | 'moderator' | null
  solobotUsername?: string
  panelMode?: 'prod' | 'test'
  onChatDeleted?: (chatId: string) => void
  onChatUpdated?: (patch: Partial<Chat>) => void
  onMessagesRefresh?: () => void
}) {
  const [profile, setProfile] = useState<ExternalProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionToast, setActionToast] = useState<string | null>(null)
  const [paymentsExpanded, setPaymentsExpanded] = useState(false)
  const [blockActionLoading, setBlockActionLoading] = useState(false)
  const cacheRef = useRef<Record<number, ExternalProfile>>({})

  useEffect(() => {
    if (!chat) return
    const cached = cacheRef.current[chat.tg_id]
    setProfile(cached ?? null)
    setLoading(!cached)
    api
      .getProfile(chat.tg_id)
      .then((data) => {
        cacheRef.current[chat.tg_id] = data
        setProfile(data)
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
  }, [chat?.tg_id])

  useEffect(() => {
    if (!actionToast) return
    const t = setTimeout(() => setActionToast(null), 2500)
    return () => clearTimeout(t)
  }, [actionToast])

  useEffect(() => {
    setPaymentsExpanded(false)
  }, [chat?.id])

  const handleOpenTelegram = () => {
    if (!chat?.tg_id) return
    const botUsername = solobotUsername?.replace(/^@/, '') || ''
    if (botUsername) {
      window.open(`https://t.me/${botUsername}?start=user_${chat.tg_id}`, '_blank')
      return
    }
    window.open(`https://t.me/${chat.tg_id}`, '_blank')
  }

  const userData = (profile?.user || {}) as Record<string, any>
  const partnerData = (profile?.partner || {}) as Record<string, any>
  const summary = ((profile as any)?.summary || {}) as Record<string, any>
  const keys = Array.isArray(profile?.keys) ? profile?.keys : []
  const tariffs = Array.isArray(profile?.tariffs) ? profile?.tariffs : []
  const payments = Array.isArray(profile?.payments) ? profile?.payments : []
  const paymentsSorted = [...payments].sort((a: any, b: any) => {
    const left = new Date(a?.created_at || 0).getTime()
    const right = new Date(b?.created_at || 0).getTime()
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0)
  })
  const remUsers = Array.isArray(profile?.remnawave) ? profile?.remnawave : profile?.remnawave ? [profile?.remnawave] : []
  const remDevices = Array.isArray(profile?.remnawave_devices) ? profile?.remnawave_devices : []

  const tariffMap = new Map<number, any>()
  tariffs.forEach((t: any) => {
    if (typeof t?.id === 'number') tariffMap.set(t.id, t)
  })

  const panelDevicesBySub = remDevices.reduce((acc: Record<string, number>, d: any) => {
    const key = String(d?.subscription_uuid || '')
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const referralCount = Number(summary.referral_count ?? ((profile?.referrals || []).length || 0))
  const hasSolobotData = Boolean(profile?.user) || keys.length > 0 || payments.length > 0 || referralCount > 0
  const partnerBalance = summary.partner_balance ?? userData.partner_balance
  const partnerCode = summary.partner_code ?? userData.partner_code
  const partnerPercent = summary.partner_percent ?? userData.partner_percent
  const payoutMethod = summary.payout_method ?? userData.payout_method
  const partnerCardNumber = summary.card_number ?? userData.card_number
  const partnerInvited = Array.isArray(partnerData?.invited) ? partnerData.invited : []
  const partnerExtraFields = Object.entries(partnerData || {}).filter(([key, value]) => {
    if (['partner_balance', 'partner_code', 'partner_percent', 'payout_method', 'card_number', 'invited', 'tg_id'].includes(key)) {
      return false
    }
    if (value === null || value === undefined || value === '') return false
    if (Array.isArray(value) && value.length === 0) return false
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false
    return true
  })
  const sourceInvite = summary.source_invite ?? userData.source_code ?? '-'
  const totalPaymentsCount = Number(
    summary.total_payments_count ??
      payments.filter((p: any) => String(p?.status || '').toLowerCase() === 'success').length
  )
  const totalPaymentsAmount = Number(
    summary.total_payments_amount ??
      payments
        .filter((p: any) => String(p?.status || '').toLowerCase() === 'success')
        .reduce((sum: number, p: any) => sum + Number(p?.amount || 0), 0)
  )

  return (
    <div className="card relative p-4 sm:p-5 h-full flex flex-col gap-3 overflow-hidden">
      {actionToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-sm text-emerald-100">
          {actionToast}
        </div>
      )}

      <div className="flex items-start justify-end">
        {onBack && (
          <button
            onClick={onBack}
            className="xl:hidden h-9 w-9 rounded-full border border-white/10 text-white/70 hover:bg-white/10"
            aria-label="Назад"
          >
            ←
          </button>
        )}
      </div>

      {!chat && <div className="flex-1 flex items-center justify-center text-sm text-white/40">Выберите чат слева</div>}

      {chat && (
        <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
          <div className="flex flex-col gap-3 text-sm">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 flex gap-3 items-center">
              <div className="h-10 w-10 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                {(chat as any).photo_url || (profile?.user as any)?.photo_url ? (
                  <img
                    src={((chat as any).photo_url || (profile?.user as any)?.photo_url) as string}
                    alt="avatar"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (chat.first_name || chat.tg_username || 'U')[0]
                )}
              </div>
              <div>
                <div className="text-white font-semibold text-[15px] leading-5">
                  {[chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.tg_username || 'Пользователь'}
                </div>
                <div className="text-[13px] text-white/60 leading-5">ID {chat.tg_id}</div>
                {chat.tg_username && <div className="text-[13px] text-white/60 leading-5">@{chat.tg_username}</div>}
              </div>
            </div>

            {loading && <div className="text-white/50 text-xs">Загрузка профиля…</div>}

            {!loading && !hasSolobotData && (
              <Section title="Информация о пользователе">
                <Line label="Регистрация в боте" value="Нет" />
              </Section>
            )}

            {hasSolobotData && (
              <>
                <Section title="Информация о пользователе">
                  <Line label="Регистрация" value={formatDate(userData.created_at || summary.created_at)} />
                  <Line label="Триал" value={formatTrial(userData.trial ?? summary.trial)} />
                  <Line label="Баланс" value={formatRubles(userData.balance)} />
                  <Line label="Пополнения" value={`${formatRubles(totalPaymentsAmount)} (${totalPaymentsCount} шт.)`} />
                  <Line label="Рефералы" value={referralCount} />
                  <Line label="Приглашён" value={String(sourceInvite)} />
                </Section>

                <Section title="Партнёрка">
                  <Line label="Баланс" value={formatRubles(partnerBalance)} />
                  <Line label="Рефералы" value={referralCount} />
                  {partnerCode ? <Line label="Код" value={String(partnerCode)} /> : null}
                  {partnerPercent !== null && partnerPercent !== undefined && partnerPercent !== ''
                    ? <Line label="Процент" value={`${Number(partnerPercent)}%`} />
                    : null}
                  {partnerCardNumber ? <Line label="Реквизиты" value={String(partnerCardNumber)} /> : null}
                  {partnerExtraFields.map(([key, value]) => (
                    <Line
                      key={key}
                      label={key}
                      value={typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    />
                  ))}
                  {partnerInvited.length > 0 ? (
                    <div className="pt-1">
                      <div className="text-white/55">Приглашённые:</div>
                      <div className="space-y-1 mt-1">
                        {partnerInvited.map((inv: any, idx: number) => (
                          <div key={idx} className="text-[12px] leading-4 text-white/75">
                            {`#${idx + 1} tg_id: ${inv?.tg_id ?? '—'}, joined_at: ${inv?.joined_at ?? '—'}, balance: ${inv?.balance ?? '—'}, subs_count: ${inv?.subs_count ?? '—'}, payments_count: ${inv?.payments_count ?? '—'}`}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Section>

                <Section title="Подписки">
                  {keys.length === 0 ? (
                    <div className="text-white/55">Нет данных</div>
                  ) : (
                    keys.map((key: any, idx: number) => {
                      const tariff = typeof key?.tariff_id === 'number' ? tariffMap.get(key.tariff_id) : undefined
                      const subUrl = key?.remnawave_link || key?.key
                      const rem = remUsers.find((u: any) => u?.subscriptionUrl === subUrl || u?.uuid === key?.client_id)
                      const subUuid = rem?.uuid || key?.client_id || ''
                      const keyName = key?.email || key?.client_id || `Ключ #${idx + 1}`
                      const keyAlias = key?.alias || '-'
                      const tariffDays = tariff?.duration_days ?? '-'
                      const cluster = key?.server_id || rem?.cluster || rem?.tag || '—'
                      const group = tariff?.subgroup_title || tariff?.group_code || 'None'
                      const tariffDevices = key?.current_device_limit ?? key?.selected_device_limit ?? tariff?.device_limit ?? rem?.hwidDeviceLimit ?? '—'
                      const panelDevices = panelDevicesBySub[String(subUuid)] || 0
                      const trafficUsed = rem?.userTraffic?.usedTrafficBytes
                      const trafficLimit = key?.current_traffic_limit ?? key?.selected_traffic_limit ?? tariff?.traffic_limit ?? rem?.trafficLimitBytes

                      return (
                        <div key={idx} className="pt-1">
                          <div className="text-white/88 font-medium">{keyName} ({keyAlias})</div>
                          <Line label="Создан" value={formatEpoch(key?.created_at)} />
                          <Line label="Истекает" value={`${formatEpoch(key?.expiry_time)}${formatRemaining(key?.expiry_time)}`} />
                          <Line label="Кластер" value={String(cluster)} />
                          <Line label="Группа" value={String(group)} />
                          <Line label="Тариф" value={tariffDays !== '-' ? `${tariffDays} ДНЕЙ` : '—'} />
                          <Line label="Устройства тариф" value={String(tariffDevices)} />
                          <Line label="Устройства панель" value={String(panelDevices)} />
                          <Line label="Трафик" value={formatTraffic(trafficUsed, trafficLimit)} />
                          {idx < keys.length - 1 && <div className="h-px bg-white/10 my-2" />}
                        </div>
                      )
                    })
                  )}
                </Section>

                <Section title="Платежи">
                  {paymentsSorted.length === 0 ? (
                    <div className="text-white/55">Нет данных</div>
                  ) : (
                    <>
                      {(paymentsExpanded ? paymentsSorted : paymentsSorted.slice(0, 5)).map((p: any, idx: number) => {
                        const details = Object.entries(p || {}).filter(([key, value]) => {
                          if (['amount', 'status', 'payment_system', 'created_at', 'tg_id'].includes(key)) return false
                          if (value === null || value === undefined || value === '') return false
                          if (Array.isArray(value) && value.length === 0) return false
                          if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false
                          return true
                        })
                        return (
                          <div key={idx} className="pb-1.5">
                            <div>
                              <span className="text-white/88 font-medium">{formatRubles(p.amount)}</span>
                              <span className="text-white/55"> | {String(p.status || '—')} | {String(p.payment_system || '—')} | {formatDate(p.created_at)}</span>
                            </div>
                            {details.length > 0 && (
                              <div className="mt-1 space-y-0.5 text-[12px] leading-4 text-white/60">
                                {details.map(([key, value]) => (
                                  <div key={key}>
                                    <span>{key}: </span>
                                    <span className="text-white/75">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {paymentsSorted.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setPaymentsExpanded((v) => !v)}
                          className="mt-1 text-[12px] text-ocean-300/90 hover:text-ocean-200"
                        >
                          {paymentsExpanded ? `Скрыть платежи (${paymentsSorted.length})` : `Показать все платежи (${paymentsSorted.length})`}
                        </button>
                      )}
                    </>
                  )}
                </Section>
              </>
            )}

            <Section title="Информация о чате">
              <Line label="Создан" value={formatDate(chat.created_at)} />
              <Line label="Последнее сообщение" value={formatDate(chat.last_message_at)} />
              <Line label="Статус" value={statusLabel[chat.status] || chat.status} />
              <Line label="Клиент" value={chat.admin_blocked ? 'Заблокирован' : 'Не заблокирован'} />
            </Section>
          </div>
        </div>
      )}

      {chat && (
        <div className="mt-auto flex flex-col gap-2">
          {panelMode !== 'test' && (
            <button
              onClick={handleOpenTelegram}
              className="w-full rounded-full border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10"
            >
              Открыть в боте
            </button>
          )}
          {chat.status !== 'ESCALATED' && (
            <button
              onClick={async () => {
                if (!chat) return
                await api.escalateChat(chat.id)
                setActionToast('Чат передан администратору')
                onChatUpdated?.({ ...chat, status: 'ESCALATED' })
              }}
              className="w-full rounded-full border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10"
            >
              Передать администратору
            </button>
          )}
          <button
            onClick={async () => {
              if (!chat || blockActionLoading) return
              const nextBlocked = !chat.admin_blocked
              setBlockActionLoading(true)
              try {
                const updated = await api.blockChat(chat.id, nextBlocked)
                setActionToast(nextBlocked ? 'Клиент заблокирован' : 'Клиент разблокирован')
                onChatUpdated?.(updated)
                onMessagesRefresh?.()
              } finally {
                setBlockActionLoading(false)
              }
            }}
            disabled={blockActionLoading}
            className={`w-full rounded-full border py-2 text-sm ${
              chat.admin_blocked
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20'
                : 'border-amber-500/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
            } ${blockActionLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {blockActionLoading ? 'Обновление…' : chat.admin_blocked ? 'Разблокировать клиента' : 'Заблокировать клиента'}
          </button>
          {chat.status !== 'CLOSED' && (
            <button
              onClick={async () => {
                if (!chat) return
                await api.closeChat(chat.id)
                setActionToast('Чат закрыт')
                onChatUpdated?.({ ...chat, status: 'CLOSED' })
              }}
              className="w-full rounded-full border border-rose-500/35 bg-rose-500/10 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
            >
              Закрыть чат
            </button>
          )}
        </div>
      )}
    </div>
  )
}
