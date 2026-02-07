import { useEffect, useRef, useState } from 'react'
import { api, Chat, ExternalProfile } from '../lib/api'

const formatDate = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return isNaN(date.getTime()) ? '' : date.toLocaleString()
}

const safeText = (value?: string | null) => (value ? value.replace(/<[^>]*>/g, '') : '')
const truncate = (value: string, max = 26) => (value.length > max ? `${value.slice(0, max - 1)}…` : value)

const formatEpoch = (value?: number | null) => {
  if (!value) return ''
  const num = Number(value)
  const ms = num > 10_000_000_000 ? num : num * 1000
  const date = new Date(ms)
  return isNaN(date.getTime()) ? '' : date.toLocaleString()
}

const formatBytes = (value?: number | null) => {
  if (!value && value !== 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = value
  let idx = 0
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024
    idx++
  }
  return `${size.toFixed(1)} ${units[idx]}`
}

const formatDuration = (start?: number | null, end?: number | null) => {
  if (!start || !end) return ''
  const s = Number(start)
  const e = Number(end)
  if (!s || !e) return ''
  const diff = Math.max(0, e - s)
  const days = Math.floor(diff / 86400)
  if (days >= 1) return `${days} дн.`
  const hours = Math.floor(diff / 3600)
  return `${hours} ч.`
}

const formatRubles = (value?: number | string | null) => {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (Number.isNaN(num)) return String(value)
  const formatted = num.toLocaleString('ru-RU')
  return `${formatted} ₽`
}

const pluralize = (n: number, one: string, few: string, many: string) => {
  const abs = Math.abs(n) % 100
  const n1 = abs % 10
  if (abs > 10 && abs < 20) return many
  if (n1 > 1 && n1 < 5) return few
  if (n1 === 1) return one
  return many
}

const formatDaysPretty = (days?: number | null) => {
  if (days === null || days === undefined) return ''
  const total = Math.max(0, Math.floor(Number(days)))
  const years = Math.floor(total / 365)
  const months = Math.floor((total % 365) / 30)
  const rest = total % 30
  const parts = []
  if (years) parts.push(`${years} г.`)
  if (months) parts.push(`${months} мес.`)
  if (rest || parts.length === 0) parts.push(`${rest} дн.`)
  return parts.join(' ')
}

const formatRemainingFromEpoch = (epochSeconds?: number | null) => {
  if (!epochSeconds) return ''
  const ms = Number(epochSeconds) > 10_000_000_000 ? Number(epochSeconds) : Number(epochSeconds) * 1000
  const now = Date.now()
  const diffDays = Math.floor((ms - now) / 86400000)
  return formatDaysPretty(diffDays)
}

const formatTraffic = (used?: number | null, limit?: number | null) => {
  if (!limit || limit === 0) return `${formatBytes(used || 0)} / безлимит`
  return `${formatBytes(used || 0)} / ${formatBytes(limit)}`
}

const copyToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // ignore
  }
}

const compactObject = (obj: Record<string, any>) => {
  const result: Record<string, any> = {}
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value) && value.length === 0) return
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return
    const lowered = key.toLowerCase()
    if (lowered.includes('raw')) return
    if (['createdat', 'updatedat', 'deletedat', '__v'].includes(lowered)) return
    result[key] = value
  })
  return result
}

const renderKeyValues = (obj: Record<string, any>) => {
  const entries = Object.entries(compactObject(obj))
  if (entries.length === 0) return <div className="text-xs text-white/40">Нет данных</div>
  const labelMap: Record<string, string> = {
    referred_tg_id: 'TG пользователя',
    referrer_tg_id: 'TG пригласившего',
    reward_issued: 'Награда выдана',
    created_at: 'Регистрация',
    updated_at: 'Обновлено',
    username: 'Username',
    first_name: 'Имя',
    last_name: 'Фамилия',
    balance: 'Баланс'
  }
  return (
    <div className="grid grid-cols-1 gap-2 text-xs text-white/70">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2"
        >
          <div className="text-white/50">{labelMap[key] || key}</div>
          <div className="text-right break-all font-mono text-white/80">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </div>
        </div>
      ))}
    </div>
  )
}

const pickFirst = (item: Record<string, any>, keys: string[]) =>
  keys.map((k) => item?.[k]).find((v) => typeof v === 'string' && v.length > 0)

const renderItems = (items: any[], titleKey: string[] = ['name', 'title', 'tariff', 'plan']) => {
  if (!items || items.length === 0) return <div className="text-xs text-white/40">Нет данных</div>
  return (
    <div className="space-y-3 text-xs text-white/70">
      {items.map((item, idx) => {
        const title = pickFirst(item || {}, titleKey) || `#${idx + 1}`
        const link =
          item?.link ||
          item?.url ||
          item?.subscription ||
          item?.config_link ||
          item?.connect_url ||
          item?.connection_url
        const expires = item?.expires_at || item?.expire_at || item?.expiration || item?.valid_until
        const status = item?.status || item?.state
        const traffic = item?.traffic || item?.traffic_total || item?.used_traffic
        const plan = item?.plan || item?.tariff || item?.package || item?.title
        const compact = compactObject(item || {})
        return (
          <div key={idx} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <div className="font-medium text-white/90">{title}</div>
            <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/50">
              {plan && <span className="rounded-full border border-white/10 px-2 py-0.5">План: {String(plan)}</span>}
              {status && <span className="rounded-full border border-white/10 px-2 py-0.5">Статус: {String(status)}</span>}
              {expires && <span className="rounded-full border border-white/10 px-2 py-0.5">До: {String(expires)}</span>}
              {traffic && <span className="rounded-full border border-white/10 px-2 py-0.5">Трафик: {String(traffic)}</span>}
            </div>
            {link && (
              <div className="mt-1 text-[11px] text-ocean-500 break-all">{String(link)}</div>
            )}
            <div className="mt-2 space-y-1">
              {Object.entries(compact).map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <div className="text-white/50">{key}</div>
                  <div className="text-right break-all">
                    {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const renderDeviceGroups = (
  devices: any[],
  openGroups: Record<string, boolean>,
  onToggle: (key: string) => void,
  onDelete: (userUuid: string, hwid: string) => void,
  filterKey?: string | null
) => {
  if (!devices || devices.length === 0) return <div className="text-xs text-white/40">Нет данных</div>
  const groups: Record<string, any[]> = {}
  devices.forEach((device) => {
    const key = device.subscription_uuid || 'unknown'
    if (!groups[key]) groups[key] = []
    groups[key].push(device)
  })
  return (
    <div className="space-y-4 text-xs text-white/70">
      {Object.entries(groups)
        .filter(([groupKey]) => !filterKey || groupKey === filterKey)
        .map(([groupKey, items]) => {
        const header = items[0]?.subscription_username || groupKey
        const status = items[0]?.subscription_status
        const isOpen = openGroups[groupKey] ?? false
        const isSelected = filterKey && groupKey === filterKey
        const statusTone =
          status === 'ACTIVE'
            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
            : status === 'EXPIRED'
              ? 'bg-rose-500/15 text-rose-300 border-rose-400/30'
              : 'bg-white/5 text-white/60 border-white/10'
        return (
          <div
            key={groupKey}
            className={`rounded-2xl border p-3 ${
              isSelected
                ? 'border-ocean-500/40 bg-ocean-600/10 shadow-glow'
                : 'border-white/10 bg-white/[0.04]'
            }`}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => onToggle(groupKey)}
                className="font-medium text-white/90 text-left"
                title={isOpen ? 'Свернуть' : 'Развернуть'}
              >
                {header}
              </button>
              {status && (
                <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusTone}`}>
                  {status}
                </span>
              )}
            </div>
            {isOpen && (
              <div className="mt-2 space-y-2">
                {items.map((device, idx) => (
                  <div key={idx} className="rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] text-white/50 font-mono">{device.hwid || device.id}</div>
                      {device.hwid && device.subscription_uuid && (
                        <button
                          onClick={() => {
                            onDelete(device.subscription_uuid, device.hwid)
                          }}
                          className="h-7 w-7 rounded-full border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
                          title="Удалить устройство"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 gap-1 text-[11px] text-white/60 font-mono">
                      {device.deviceModel && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Устройство</span>
                          <span className="text-right text-white/80">{device.deviceModel}</span>
                        </div>
                      )}
                      {device.platform && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">OC</span>
                          <span className="text-right text-white/80">{device.platform}</span>
                        </div>
                      )}
                      {device.osVersion && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Версия</span>
                          <span className="text-right text-white/80">{device.osVersion}</span>
                        </div>
                      )}
                      {device.userAgent && (
                        <div className="flex items-start justify-between gap-3">
                          <span className="text-white/40">User‑Agent</span>
                          <span className="text-right text-white/70 break-all">{device.userAgent}</span>
                        </div>
                      )}
                      {device.createdAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-white/40">Добавлено</span>
                          <span className="text-right text-white/70">{formatDate(device.createdAt)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const renderSoloBotKeys = (
  keys: any[],
  tariffs: any[],
  remUsers: any[],
  devices: any[],
  deviceCounts: Record<string, number>,
  openKeys: Record<string, boolean>,
  onToggle: (key: string) => void,
  onOpenDevices: (subscriptionUuid: string) => void
) => {
  if (!keys || keys.length === 0) return <div className="text-xs text-white/40">Нет ключей</div>
  const tariffMap = new Map<number, any>()
  ;(tariffs || []).forEach((t) => {
    if (typeof t?.id === 'number') tariffMap.set(t.id, t)
  })
  const remUsersList = Array.isArray(remUsers) ? remUsers : remUsers ? [remUsers] : []
  const sortedKeys = [...keys].sort((a, b) => (b.expiry_time || 0) - (a.expiry_time || 0))
  
  // Helper to get remaining days as number
  const getRemainingDays = (epochSeconds?: number | null) => {
    if (!epochSeconds) return 0
    const ms = Number(epochSeconds) > 10_000_000_000 ? Number(epochSeconds) : Number(epochSeconds) * 1000
    return Math.max(0, Math.floor((ms - Date.now()) / 86400000))
  }
  
  // Helper to get progress percentage
  const getProgress = (created?: number, expiry?: number) => {
    if (!created || !expiry) return 0
    const start = Number(created) > 10_000_000_000 ? Number(created) : Number(created) * 1000
    const end = Number(expiry) > 10_000_000_000 ? Number(expiry) : Number(expiry) * 1000
    const now = Date.now()
    const total = end - start
    const elapsed = now - start
    if (total <= 0) return 100
    return Math.min(100, Math.max(0, (elapsed / total) * 100))
  }
  
  return (
    <div className="space-y-2">
      {sortedKeys.map((key, idx) => {
        const tariff = typeof key.tariff_id === 'number' ? tariffMap.get(key.tariff_id) : undefined
        const title = tariff?.name || key.alias || `Ключ #${idx + 1}`
        const expiry = formatEpoch(key.expiry_time)
        const durationSeconds =
          key.created_at && key.expiry_time ? Math.max(0, Number(key.expiry_time) - Number(key.created_at)) : null
        const durationDaysFallback = durationSeconds ? Math.floor(durationSeconds / 86400) : null
        const durationDays = tariff?.duration_days ?? durationDaysFallback
        const status = key.is_frozen ? 'Заморожен' : 'Активен'
        const remaining = formatRemainingFromEpoch(key.expiry_time)
        const remainingDays = getRemainingDays(key.expiry_time)
        const progress = getProgress(key.created_at, key.expiry_time)
        const group = tariff?.subgroup_title || tariff?.group_code

        const link = key.remnawave_link || key.key
        const rem = link ? remUsersList.find((u) => u?.subscriptionUrl === link) : undefined
        const deviceLimit = key.current_device_limit ?? key.selected_device_limit ?? tariff?.device_limit ?? rem?.hwidDeviceLimit
        const trafficLimit = key.current_traffic_limit ?? key.selected_traffic_limit ?? tariff?.traffic_limit ?? rem?.trafficLimitBytes
        const trafficUsed = rem?.userTraffic?.usedTrafficBytes
        const connectedDevices = rem?.uuid ? deviceCounts[rem.uuid] : undefined
        const devicesForSub = rem?.uuid
          ? (devices || []).filter((d: any) => d?.subscription_uuid === rem.uuid)
          : []
        const isOpen = openKeys[key.client_id || key.key || String(idx)] ?? false
        
        // Color based on remaining days
        const urgencyColor = remainingDays <= 3 
          ? 'from-rose-500 to-rose-600' 
          : remainingDays <= 7 
            ? 'from-amber-500 to-orange-500' 
            : 'from-emerald-500 to-teal-500'
        const urgencyBg = remainingDays <= 3 
          ? 'bg-rose-500/10 border-rose-500/20' 
          : remainingDays <= 7 
            ? 'bg-amber-500/10 border-amber-500/20' 
            : 'bg-emerald-500/10 border-emerald-500/20'
        const urgencyText = remainingDays <= 3 
          ? 'text-rose-400' 
          : remainingDays <= 7 
            ? 'text-amber-400' 
            : 'text-emerald-400'
        
        return (
          <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            {/* Header with toggle */}
            <button
              onClick={() => onToggle(key.client_id || key.key || String(idx))}
              className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${urgencyColor} flex items-center justify-center shrink-0`}>
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-white">{title}</span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${key.is_frozen ? 'bg-rose-500/15 text-rose-300 border-rose-400/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'}`}>
                    {status}
                  </span>
                </div>
                <div className="text-[10px] text-white/40">{group || 'standart'} • {trafficLimit ? formatTraffic(trafficUsed, trafficLimit) : '∞ трафик'}</div>
              </div>
              <div className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-white/30 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            
            {/* Quick stats bar - always visible */}
            <div className="px-3 pb-2.5 flex items-center gap-3">
              <div className={`flex-1 rounded-lg ${urgencyBg} border px-2.5 py-1.5`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] text-white/40 uppercase tracking-wide">Осталось</span>
                  <span className={`text-[11px] font-bold ${urgencyText}`}>{remaining || '—'}</span>
                </div>
                <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                  <div 
                    className={`h-full rounded-full bg-gradient-to-r ${urgencyColor}`}
                    style={{ width: `${100 - progress}%` }}
                  />
                </div>
                <div className="mt-1 text-[9px] text-white/40 text-right">
                  {trafficLimit ? formatTraffic(trafficUsed, trafficLimit) : `${formatBytes(trafficUsed || 0)} / ∞`}
                </div>
              </div>
              {deviceLimit !== undefined && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if ((connectedDevices ?? 0) > 0 && rem?.uuid) onOpenDevices(rem.uuid)
                  }}
                  disabled={(connectedDevices ?? 0) === 0}
                  className={`shrink-0 rounded-lg ${urgencyBg} border px-3 py-1.5 text-center min-w-[60px] transition-colors ${(connectedDevices ?? 0) > 0 ? 'hover:bg-white/[0.05] cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="text-[12px] font-bold text-white">{connectedDevices ?? 0}<span className="text-white/30">/{deviceLimit}</span></div>
                  <div className="text-[10px] text-white/50">устройств</div>
                </button>
              )}
            </div>
            
            {/* Expanded content */}
            {isOpen && (
              <div className="border-t border-white/[0.04] px-3 py-2.5 space-y-1.5">
                {/* Expiry date */}
                {expiry && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/40">Истекает</span>
                    <span className="font-mono text-white/70">{expiry}</span>
                  </div>
                )}
                
                {/* Subscription URL */}
                {(key.remnawave_link || key.key) && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Ссылка</span>
                    <div className="flex items-center gap-1">
                      <a
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="h-6 w-6 rounded bg-white/[0.05] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        title="Открыть"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                      <button
                        type="button"
                        onClick={() => link && copyToClipboard(link)}
                        className="h-6 w-6 rounded bg-white/[0.05] flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                        title="Скопировать"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
                
                {/* Devices */}
                {rem?.uuid && devicesForSub.length > 0 && (
                  <div className="pt-1.5 border-t border-white/[0.04]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-white/40">Устройства</span>
                      <button
                        onClick={() => onOpenDevices(rem.uuid)}
                        className="text-[9px] text-ocean-400 hover:text-ocean-300"
                      >
                        Управление →
                      </button>
                    </div>
                    <div className="space-y-1">
                      {devicesForSub.slice(0, 2).map((device: any, dIdx: number) => (
                        <div key={dIdx} className="flex items-center gap-2 text-[10px] bg-white/[0.02] rounded px-2 py-1">
                          <span>{device.platform?.toLowerCase().includes('ios') ? '📱' : device.platform?.toLowerCase().includes('android') ? '🤖' : '💻'}</span>
                          <span className="text-white/60 truncate">{device.deviceModel || device.platform || 'Устройство'}</span>
                        </div>
                      ))}
                      {devicesForSub.length > 2 && (
                        <div className="text-[9px] text-white/30 text-center">+{devicesForSub.length - 2} ещё</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

const renderSoloBotPayments = (payments: any[]) => {
  if (!payments || payments.length === 0) return <div className="text-xs text-white/40">Нет платежей</div>
  const sortedPayments = [...payments].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0
    return bTime - aTime
  })
  return (
    <div className="space-y-2">
      {sortedPayments.map((payment, idx) => {
        const status = (payment.status || '').toString().toLowerCase()
        const isSuccess = status.includes('success') || status.includes('paid')
        const isFailed = status.includes('fail') || status.includes('error')
        const statusColor = isSuccess
          ? 'from-emerald-500 to-teal-500'
          : isFailed
            ? 'from-rose-500 to-rose-600'
            : 'from-gray-500 to-gray-600'
        const statusBg = isSuccess
          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          : isFailed
            ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            : 'bg-white/5 border-white/10 text-white/60'
        const amount = payment.amount !== undefined ? formatRubles(payment.amount) : null
        const date = formatDate(payment.created_at)
        
        return (
          <div key={idx} className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <div className="px-3 py-2.5 flex items-center gap-3">
              {/* Icon */}
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${statusColor} flex items-center justify-center shrink-0`}>
                {isSuccess ? (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : isFailed ? (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-mono text-white/50">{date || '—'}</span>
                  {payment.status && (
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium ${statusBg}`}>
                      {payment.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {payment.payment_system && (
                    <span className="text-[10px] text-white/40 bg-white/[0.03] rounded px-1.5 py-0.5">
                      {payment.payment_system}
                    </span>
                  )}
                  {amount && (
                    <span className="text-[12px] font-semibold text-white">
                      {amount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const renderTable = (
  rows: any[],
  columns: { key: string; label: string; formatter?: (v: any) => string }[],
  maxHeight = '320px'
) => {
  if (!rows || rows.length === 0) return <div className="text-xs text-white/40">Нет данных</div>
  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full text-xs text-white/70">
        <thead className="sticky top-0 bg-ink-900/80 backdrop-blur border-b border-white/10">
          <tr className="text-white/40">
            {columns.map((col) => (
              <th key={col.key} className="text-left font-medium pb-2">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className="border-t border-white/5">
              {columns.map((col) => (
                <td key={col.key} className="py-2 pr-4 align-top font-mono text-white/80">
                  {col.formatter ? col.formatter(row[col.key]) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const renderRemnawaveUser = (user?: Record<string, any>) => {
  if (!user) return <div className="text-xs text-white/40">Нет данных</div>
  const rows = [
    { label: 'Статус', value: user.status },
    { label: 'Expire', value: formatDate(user.expireAt) },
    { label: 'Traffic', value: formatBytes(user.trafficLimitBytes) },
    { label: 'Strategy', value: user.trafficLimitStrategy },
    { label: 'Tag', value: user.tag },
    { label: 'Email', value: user.email },
  ].filter((r) => r.value)
  return (
    <div className="grid grid-cols-1 gap-2 text-xs text-white/70">
      {rows.map((r, idx) => (
        <div key={idx} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <div className="text-white/50">{r.label}</div>
          <div className="text-right break-all">{String(r.value)}</div>
        </div>
      ))}
    </div>
  )
}

const statusLabel: Record<string, string> = {
  NEW: 'Новый',
  ACTIVE: 'Активный',
  CLOSED: 'Закрыт',
  ESCALATED: 'У админа'
}

export default function ProfilePanel({
  chat,
  onBack,
  userRole,
  solobotUsername,
  panelMode,
  onChatDeleted,
  onChatUpdated
}: {
  chat?: Chat
  onBack?: () => void
  userRole?: 'administrator' | 'moderator' | null
  solobotUsername?: string
  panelMode?: 'prod' | 'test'
  onChatDeleted?: (chatId: string) => void
  onChatUpdated?: (patch: Partial<Chat>) => void
}) {
  const [profile, setProfile] = useState<ExternalProfile | null>(null)
  const [loading, setLoading] = useState(false)
  const [updatedToast, setUpdatedToast] = useState(false)
  const [actionToast, setActionToast] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [keyFilter, setKeyFilter] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')
  const [tab, setTab] = useState<'details' | 'subscriptions' | 'payments' | 'partner' | 'devices' | 'chat'>('details')
  const [keysOpen, setKeysOpen] = useState(false)
  const [paymentsOpen, setPaymentsOpen] = useState(true)
  const [referralsOpen, setReferralsOpen] = useState(false)
  const [referralItemsOpen, setReferralItemsOpen] = useState<Record<string, boolean>>({})
  const [deviceGroupsOpen, setDeviceGroupsOpen] = useState<Record<string, boolean>>({})
  const [deviceFilter, setDeviceFilter] = useState<string | null>(null)
  const [keyItemsOpen, setKeyItemsOpen] = useState<Record<string, boolean>>({})
  const [deviceConfirm, setDeviceConfirm] = useState<{ userUuid: string; hwid: string; label?: string } | null>(null)
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
        setUpdatedToast(true)
      })
      .catch(() => setProfile(null))
      .finally(() => setLoading(false))
    setDeviceFilter(null)
  }, [chat?.tg_id])

  useEffect(() => {
    if (!updatedToast) return
    const t = setTimeout(() => setUpdatedToast(false), 2000)
    return () => clearTimeout(t)
  }, [updatedToast])

  useEffect(() => {
    if (!actionToast) return
    const t = setTimeout(() => setActionToast(null), 3000)
    return () => clearTimeout(t)
  }, [actionToast])


  const handleDeleteDevice = async (userUuid: string, hwid: string) => {
    await api.deleteRemnawaveDevice(userUuid, hwid)
    if (!chat) return
    setProfile((prev) => {
      if (!prev) return prev
      const next = {
        ...prev,
        remnawave_devices: (prev.remnawave_devices || []).filter(
          (d: any) => !(d?.subscription_uuid === userUuid && d?.hwid === hwid)
        )
      }
      cacheRef.current[chat.tg_id] = next
      return next
    })
  }

  const openDevicesForSubscription = (subscriptionUuid: string) => {
    setTab('devices')
    setDeviceFilter(subscriptionUuid)
    setDeviceGroupsOpen((prev) => ({ ...prev, [subscriptionUuid]: true }))
  }

  const handleDeleteChat = async () => {
    if (!chat) return
    setDeleteLoading(true)
    try {
      await api.deleteChat(chat.id)
      setDeleteConfirm(false)
      onChatDeleted?.(chat.id)
    } catch (error) {
      console.error('Failed to delete chat:', error)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleOpenTelegram = () => {
    if (!chat?.tg_id) return
    const botUsername = solobotUsername?.replace(/^@/, '') || ''
    if (botUsername) {
      window.open(`https://t.me/${botUsername}?start=user_${chat.tg_id}`, '_blank')
      return
    }
    window.open(`https://t.me/${chat.tg_id}`, '_blank')
  }

  return (
    <div className="card relative p-4 sm:p-5 h-full flex flex-col gap-3 overflow-hidden">
      {updatedToast && (
        <div className="absolute right-5 bottom-5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-[11px] text-emerald-100 shadow-soft z-10">
          Обновлено
        </div>
      )}
      {actionToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-emerald-400/30 bg-emerald-500/20 backdrop-blur-xl px-5 py-3 text-sm text-emerald-100 shadow-2xl">
          ✓ {actionToast}
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-display font-semibold">Информация о пользователе</div>
          <div className="text-xs text-white/50">Детали, подписки, устройства</div>
        </div>
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

      {!chat && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] flex items-center justify-center">
            <svg className="h-7 w-7 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-white/40 text-sm">Нет активного диалога</div>
            <div className="text-white/25 text-xs mt-1">Выберите чат слева</div>
          </div>
        </div>
      )}
      {chat && loading && <div className="text-white/40 text-sm">Загрузка…</div>}
      {chat && !loading && (
        <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
          <div className="flex flex-col gap-3 text-sm">
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4 flex gap-4 items-center">
            <div className="h-12 w-12 rounded-full overflow-hidden bg-gradient-to-br from-ocean-600/40 to-gold-500/30 flex items-center justify-center font-display text-base">
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
              <div className="text-white/90 font-semibold">
                {truncate(safeText([chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.tg_username || ''), 28)}
              </div>
              <div className="text-xs text-white/50">ID {chat.tg_id}</div>
              {chat.tg_username && <div className="text-xs text-white/50">@{truncate(safeText(chat.tg_username), 24)}</div>}
            </div>
          </div>


          <div className="rounded-3xl bg-white/5 border border-white/10 p-2 flex gap-2 flex-wrap">
            {[
              { key: 'details', label: 'Детали' },
              { key: 'subscriptions', label: 'Подписки' },
              { key: 'payments', label: 'Платежи' },
              { key: 'partner', label: 'Партнерка' },
              { key: 'devices', label: 'Устройства' },
              { key: 'chat', label: 'Чат' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key as any)}
                className={`flex-1 min-w-[120px] rounded-2xl px-3 py-2 text-xs ${
                  tab === item.key ? 'bg-white/10 text-white' : 'text-white/50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
              <div className="text-white/80 font-medium">Детальная информация</div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-white/70">
                {[chat.first_name, chat.last_name].filter(Boolean).join(' ') && (
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="text-white/50">Полное имя</div>
                    <div className="text-right font-mono text-white/80 truncate max-w-[140px]">{truncate(safeText([chat.first_name, chat.last_name].filter(Boolean).join(' ')), 20)}</div>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                  <div className="text-white/50">ID пользователя</div>
                  <div className="text-right font-mono text-white/80">{chat.tg_id}</div>
                </div>
                {chat.tg_username && (
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="text-white/50">Username</div>
                    <div className="text-right font-mono text-white/80 truncate max-w-[140px]">@{truncate(safeText(chat.tg_username), 18)}</div>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                  <div className="text-white/50">Регистрация в боте</div>
                  <div className="text-right font-mono text-white/80">{profile?.user ? 'Да' : 'Нет'}</div>
                </div>
                {(profile?.user as any)?.balance !== undefined && (
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="text-white/50">Баланс</div>
                    <div className="text-right font-mono text-white/80">
                      {formatRubles((profile?.user as any)?.balance)}
                    </div>
                  </div>
                )}
                {(profile?.user as any)?.created_at && (
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="text-white/50">Дата регистрации</div>
                    <div className="text-right font-mono text-white/80">{formatDate((profile?.user as any)?.created_at)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'subscriptions' && (
            <div className="rounded-3xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ocean-500 to-ocean-600 flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold">Подписки</div>
                    <div className="text-[11px] text-white/40">Активные ключи и тарифы</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-full bg-ocean-500/10 border border-ocean-500/20 text-ocean-300 text-xs font-medium">
                    {(profile?.keys || []).length} ключей
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button
                  onClick={() => setKeysOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2 text-white/70">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    <span className="text-sm font-medium">Список ключей</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">{keysOpen ? 'Свернуть' : 'Развернуть'}</span>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white/40 transition-transform duration-200 ${keysOpen ? 'rotate-180' : ''}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>
                {keysOpen && (
                  <div className="border-t border-white/[0.06] p-4">
                    <div className="relative mb-4">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        value={keyFilter}
                        onChange={(e) => setKeyFilter(e.target.value)}
                        placeholder="Поиск по ключам..."
                        className="w-full h-10 pl-9 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-ocean-500/30"
                      />
                    </div>
                    <div className="max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                      {renderSoloBotKeys(
                        (profile?.keys || []).filter((k: any) =>
                          JSON.stringify(k).toLowerCase().includes(keyFilter.toLowerCase())
                        ),
                        profile?.tariffs || [],
                        profile?.remnawave || [],
                        profile?.remnawave_devices || [],
                        (profile?.remnawave_devices || []).reduce((acc: Record<string, number>, d: any) => {
                          const key = d?.subscription_uuid
                          if (key) acc[key] = (acc[key] || 0) + 1
                          return acc
                        }, {}),
                        keyItemsOpen,
                        (keyId) => setKeyItemsOpen((prev) => ({ ...prev, [keyId]: !(prev[keyId] ?? false) })),
                        openDevicesForSubscription
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'payments' && (
            <div className="rounded-3xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold">Платежи</div>
                    <div className="text-[11px] text-white/40">История транзакций</div>
                  </div>
                </div>
                <span className="px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium">
                  {(profile?.payments || []).length} платежей
                </span>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button
                  onClick={() => setPaymentsOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2 text-white/70">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                    </svg>
                    <span className="text-sm font-medium">История платежей</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">{paymentsOpen ? 'Свернуть' : 'Развернуть'}</span>
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white/40 transition-transform duration-200 ${paymentsOpen ? 'rotate-180' : ''}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>
                {paymentsOpen && (
                  <div className="border-t border-white/[0.06] p-4">
                    <div className="relative mb-4">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <input
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value)}
                        placeholder="Поиск по платежам..."
                        className="w-full h-10 pl-9 pr-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-violet-500/30"
                      />
                    </div>
                    <div className="max-h-[400px] overflow-y-auto pr-1 scrollbar-thin">
                      {renderSoloBotPayments(
                        (profile?.payments || []).filter((p: any) =>
                          JSON.stringify(p).toLowerCase().includes(paymentFilter.toLowerCase())
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'partner' && (
            <div className="rounded-3xl bg-gradient-to-br from-white/[0.04] to-transparent border border-white/[0.08] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-white font-semibold">Партнёрская программа</div>
                    <div className="text-[11px] text-white/40">Приглашённые пользователи</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] font-medium whitespace-nowrap">
                  {(profile?.referrals || []).length} {pluralize((profile?.referrals || []).length, 'реферал', 'реферала', 'рефералов')}
                </span>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                <button
                  onClick={() => setReferralsOpen((v) => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2 text-white/70">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                    </svg>
                    <span className="text-sm font-medium">Список рефералов</span>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-white/40 transition-transform duration-200 ${referralsOpen ? 'rotate-180' : ''}`}>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </button>
                {referralsOpen && (
                  <div className="border-t border-white/[0.06] p-4">
                    <div className="max-h-[400px] overflow-y-auto pr-1 scrollbar-thin space-y-2">
                      {(profile?.referrals || []).length === 0 && (
                        <div className="flex flex-col items-center justify-center py-8 text-white/40">
                          <svg className="w-12 h-12 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                          </svg>
                          <span className="text-sm">Нет приглашённых пользователей</span>
                          <span className="text-xs mt-1">Поделитесь своей реферальной ссылкой</span>
                        </div>
                      )}
                      {(profile?.referrals || []).map((ref: any, idx: number) => {
                        const key = String(ref?.referred_tg_id || ref?.user?.tg_id || idx)
                        const isOpen = referralItemsOpen[key] ?? false
                        const displayName = ref.user
                          ? truncate(safeText([ref.user.first_name, ref.user.last_name].filter(Boolean).join(' ')), 20) ||
                            (ref.user.username ? `@${truncate(safeText(ref.user.username), 16)}` : `TG ${ref.referred_tg_id}`)
                          : `TG ${ref.referred_tg_id}`
                        
                        return (
                          <div key={idx} className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setReferralItemsOpen((prev) => ({ ...prev, [key]: !isOpen }))}
                              className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 shrink-0 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center">
                                  <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                  </svg>
                                </div>
                                <div className="text-xs text-white/90 font-medium truncate">{displayName}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                  ref.reward_issued
                                    ? 'bg-emerald-500/15 text-emerald-400'
                                    : 'bg-white/5 text-white/50'
                                }`}>
                                  {ref.reward_issued ? '✓' : '⏳'}
                                </span>
                                <div className={`w-5 h-5 rounded flex items-center justify-center text-white/40 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                  </svg>
                                </div>
                              </div>
                            </button>
                            {isOpen && (
                              <div className="px-3 pb-3 border-t border-white/[0.06] pt-2 space-y-1">
                                <div className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.04]">
                                  <span className="text-white/40">TG ID</span>
                                  <span className="font-mono text-white/70">{ref.referred_tg_id}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.04]">
                                  <span className="text-white/40">Пригласил</span>
                                  <span className="font-mono text-white/70">{ref.referrer_tg_id}</span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.04]">
                                  <span className="text-white/40">Награда</span>
                                  <span className={ref.reward_issued ? 'text-emerald-400' : 'text-white/50'}>
                                    {ref.reward_issued ? 'Выдана' : 'Ожидает'}
                                  </span>
                                </div>
                                {ref.user && (
                                  <>
                                    {([ref.user.first_name, ref.user.last_name].filter(Boolean).join(' ')) && (
                                      <div className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.04]">
                                        <span className="text-white/40">Имя</span>
                                        <span className="text-white/70 truncate max-w-[100px]">{truncate(safeText([ref.user.first_name, ref.user.last_name].filter(Boolean).join(' ')), 18)}</span>
                                      </div>
                                    )}
                                    {ref.user.username && (
                                      <div className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.04]">
                                        <span className="text-white/40">Username</span>
                                        <span className="font-mono text-white/70 truncate max-w-[100px]">@{truncate(safeText(ref.user.username), 14)}</span>
                                      </div>
                                    )}
                                    {ref.user.balance !== undefined && (
                                      <div className="flex items-center justify-between text-[11px] py-1 border-b border-white/[0.04]">
                                        <span className="text-white/40">Баланс</span>
                                        <span className="font-medium text-emerald-400">{formatRubles(ref.user.balance)}</span>
                                      </div>
                                    )}
                                    {ref.user.created_at && (
                                      <div className="flex items-center justify-between text-[11px] py-1">
                                        <span className="text-white/40">Регистрация</span>
                                        <span className="text-white/70">{formatDate(ref.user.created_at)}</span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {tab === 'devices' && (
            <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
              <div className="text-white/80 font-medium">Устройства</div>
              {Array.isArray(profile?.remnawave_devices) && profile?.remnawave_devices.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <button
                    onClick={() => setDeviceFilter(null)}
                    className={`rounded-full border px-3 py-1 ${
                      !deviceFilter ? 'border-white/20 text-white' : 'border-white/10 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    Все устройства
                  </button>
                  {Object.entries(
                    (profile?.remnawave_devices || []).reduce((acc: Record<string, any>, d: any) => {
                      const key = d?.subscription_uuid || 'unknown'
                      if (!acc[key]) acc[key] = d
                      return acc
                    }, {})
                  ).map(([subKey, item]) => (
                    <button
                      key={subKey}
                      onClick={() => openDevicesForSubscription(subKey)}
                      className={`rounded-full border px-3 py-1 ${
                        deviceFilter === subKey
                          ? 'border-white/20 text-white'
                          : 'border-white/10 text-white/50 hover:bg-white/10'
                      }`}
                    >
                      {item?.subscription_username || subKey}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 max-h-[560px] overflow-y-auto pr-1 scrollbar-thin">
                {renderDeviceGroups(
                  profile?.remnawave_devices || [],
                  deviceGroupsOpen,
                  (key) => setDeviceGroupsOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? false) })),
                  (userUuid, hwid) => setDeviceConfirm({ userUuid, hwid }),
                  deviceFilter
                )}
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <div className="rounded-3xl bg-white/5 border border-white/10 p-4">
              <div className="text-white/80 font-medium">Информация о чате</div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-white/70">
                {chat.created_at && (
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="text-white/50">Создан</div>
                    <div className="font-mono text-white/80 text-right">{formatDate(chat.created_at)}</div>
                  </div>
                )}
                {chat.last_message_at && (
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                    <div className="text-white/50">Последнее сообщение</div>
                    <div className="font-mono text-white/80 text-right">{formatDate(chat.last_message_at)}</div>
                  </div>
                )}
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-white/[0.04] border border-white/5 px-3 py-2">
                  <div className="text-white/50">Статус</div>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                      chat.status === 'ACTIVE'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
                        : chat.status === 'NEW'
                          ? 'bg-ocean-500/15 text-ocean-300 border-ocean-400/30'
                          : chat.status === 'CLOSED'
                            ? 'bg-white/10 text-white/50 border-white/10'
                            : 'bg-gold-500/15 text-gold-300 border-gold-400/30'
                    }`}
                  >
                    {statusLabel[chat.status] || chat.status}
                  </span>
                </div>
              </div>
            </div>
          )}
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
          <button
            onClick={async () => {
              if (!chat) return
              await api.escalateChat(chat.id)
              setActionToast('Чат передан администратору')
              onChatUpdated?.({ ...chat, status: 'ESCALATED' })
            }}
            className="w-full rounded-full border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10 active:bg-white/20 touch-manipulation"
          >
            Передать админу
          </button>
          <button
            onClick={async () => {
              if (!chat) return
              await api.closeChat(chat.id)
              setActionToast('Чат успешно закрыт')
              onChatUpdated?.({ ...chat, status: 'CLOSED' })
            }}
            className="w-full rounded-full border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10 active:bg-white/20 touch-manipulation"
          >
            Закрыть чат
          </button>
          {userRole === 'administrator' && panelMode !== 'test' && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="w-full rounded-full bg-rose-500/10 border border-rose-500/30 py-2 text-sm text-rose-300 hover:bg-rose-500/20 transition-colors"
            >
              Удалить чат
            </button>
          )}
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-[380px] max-w-full rounded-2xl border border-rose-500/20 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-rose-500/15 flex items-center justify-center flex-shrink-0">
                <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <div className="text-base font-semibold text-white">Удалить чат?</div>
                <div className="text-xs text-white/50">Это действие нельзя отменить</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-rose-500/5 border border-rose-500/10 p-3">
              <div className="text-xs text-white/60">
                Чат с <span className="text-white/90 font-medium">{truncate(safeText(chat?.first_name || chat?.tg_username || ''), 20) || 'пользователем'}</span> и все сообщения будут удалены навсегда.
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                onClick={() => setDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Отмена
              </button>
              <button
                className="flex-1 rounded-xl bg-rose-500 py-2 text-sm text-white font-medium hover:bg-rose-600 transition-colors disabled:opacity-50"
                onClick={handleDeleteChat}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deviceConfirm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-[380px] max-w-full rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5">
            <div className="text-base font-semibold text-white">Удалить устройство?</div>
            <div className="mt-2 text-xs text-white/60">
              HWID: <span className="font-mono text-white/80">{deviceConfirm.hwid}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                onClick={() => setDeviceConfirm(null)}
              >
                Отмена
              </button>
              <button
                className="flex-1 rounded-xl bg-rose-500 py-2 text-sm text-white font-medium hover:bg-rose-600 transition-colors"
                onClick={async () => {
                  const payload = deviceConfirm
                  setDeviceConfirm(null)
                  await handleDeleteDevice(payload.userUuid, payload.hwid)
                }}
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
