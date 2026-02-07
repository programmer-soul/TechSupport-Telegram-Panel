import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Icons
const Icon = {
  brand: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
    </svg>
  ),
  bot: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    </svg>
  ),
  message: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  sparkle: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  ),
  bolt: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  telegram: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
    </svg>
  ),
  chevron: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  ),
}

// Components
function Input({ label, value, onChange, placeholder, hint, secret, disabled }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  secret?: boolean
  disabled?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-medium text-white/50">{label}</label>
      <div className="relative">
        <input
          type={secret && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full h-11 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.05] transition-all disabled:opacity-40"
        />
        {secret && value && (
          <button onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30 hover:text-white/60 transition-colors uppercase tracking-wider">
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-white/30">{hint}</p>}
    </div>
  )
}

function Textarea({ label, value, onChange, placeholder, hint, rows = 3, disabled }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  hint?: string
  rows?: number
  disabled?: boolean
}) {
  return (
    <div className="space-y-2">
      <label className="text-[13px] font-medium text-white/50">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[14px] text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 focus:bg-white/[0.05] transition-all resize-none disabled:opacity-40 font-mono"
      />
      {hint && <p className="text-[11px] text-white/30">{hint}</p>}
    </div>
  )
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onChange(!enabled)
      }}
      role="switch"
      aria-checked={enabled}
      className={`relative w-12 h-7 rounded-full transition-all duration-300 cursor-pointer ${enabled ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-white/10'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-300 ${enabled ? 'left-6' : 'left-1'}`} />
    </div>
  )
}

function Badge({ status }: { status: 'active' | 'warning' | 'off' }) {
  const styles = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    off: 'bg-white/5 text-white/40 border-white/10',
  }
  const labels = { active: 'Актив', warning: 'Настр.', off: 'Выкл.' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border whitespace-nowrap shrink-0 ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-400' : status === 'warning' ? 'bg-amber-400 animate-pulse' : 'bg-white/30'}`} />
      {labels[status]}
    </span>
  )
}

function CollapsibleCard({ id, icon, title, subtitle, status, color, children, expanded, onToggle }: {
  id: string
  icon: ReactNode
  title: string
  subtitle: string
  status: 'active' | 'warning' | 'off'
  color: string
  children: ReactNode
  expanded: boolean
  onToggle: (id: string) => void
}) {
  return (
    <div className={`group rounded-2xl border transition-all duration-300 overflow-hidden ${expanded ? 'border-white/[0.1]' : 'border-white/[0.06]'} bg-gradient-to-br from-white/[0.02] via-transparent to-transparent`}>
      <button
        onClick={() => onToggle(id)}
        className={`w-full px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between hover:bg-white/[0.02] transition-all ${expanded ? `bg-gradient-to-r ${color}` : ''}`}
      >
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 shrink-0 rounded-xl flex items-center justify-center transition-all ${expanded ? 'bg-white/[0.1] text-white' : 'bg-white/[0.05] text-white/50'}`}>
            {icon}
          </div>
          <div className="text-left min-w-0">
            <h3 className="text-[14px] sm:text-[15px] font-semibold text-white truncate">{title}</h3>
            <p className="text-[11px] sm:text-[12px] text-white/40 mt-0.5 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-2">
          <Badge status={status} />
          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-white/40 transition-all duration-300 ${expanded ? 'rotate-180 bg-white/[0.05]' : 'hover:bg-white/[0.05]'}`}>
            {Icon.chevron}
          </div>
        </div>
      </button>

      <div className={`grid transition-all duration-300 ease-in-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="p-6 pt-2 space-y-5 border-t border-white/[0.04]">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

interface SettingsPanelProps {
  onBrandingChange?: (name: string, description: string, pageTitle: string, faviconUrl: string) => void
  onPanelModeChange?: (mode: 'prod' | 'test') => void
}

export default function SettingsPanel({ onBrandingChange, onPanelModeChange }: SettingsPanelProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['branding', 'bot']))

  // Panel mode
  const [panelMode, setPanelMode] = useState<'prod' | 'test'>('prod')

  // Branding
  const [appName, setAppName] = useState('')
  const [appDesc, setAppDesc] = useState('')
  const [pageTitle, setPageTitle] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')

  // Support Bot
  const [botUsername, setBotUsername] = useState('')
  const [botToken, setBotToken] = useState('')

  // Messages
  const [greeting, setGreeting] = useState('')
  const [greetingEnabled, setGreetingEnabled] = useState(true)
  const [autoreply, setAutoreply] = useState('')
  const [autoreplyEnabled, setAutoreplyEnabled] = useState(true)
  const [autoreplyDeleteSec, setAutoreplyDeleteSec] = useState('0')

  // Remnawave
  const [remnaUrl, setRemnaUrl] = useState('')
  const [remnaToken, setRemnaToken] = useState('')

  // Solobot
  const [soloUrl, setSoloUrl] = useState('')
  const [soloKey, setSoloKey] = useState('')
  const [soloAdminId, setSoloAdminId] = useState('')
  const [soloUsername, setSoloUsername] = useState('')

  // Telegram OAuth
  const [tgOAuthEnabled, setTgOAuthEnabled] = useState(false)
  const [tgOAuthBot, setTgOAuthBot] = useState('')
  const [tgOAuthToken, setTgOAuthToken] = useState('')
  const [tgOAuthExpanded, setTgOAuthExpanded] = useState(false)

  useEffect(() => { load() }, [])

  const toggleCard = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listSettings()

      const get = (key: string) => data.find(s => s.key === key)?.value_json as Record<string, unknown> | undefined

      const mode = get('panel_mode')
      if (mode && (mode.mode === 'test' || mode.mode === 'prod')) {
        setPanelMode(mode.mode)
      } else {
        setPanelMode('prod')
      }

      const brand = get('app_branding')
      if (brand) {
        setAppName(brand.name as string || '')
        setAppDesc(brand.description as string || '')
        setPageTitle(brand.page_title as string || '')
        setFaviconUrl(brand.favicon_url as string || '')
      }

      const bot = get('support_bot')
      if (bot) { setBotUsername(bot.username as string || ''); setBotToken(bot.token as string || '') }

      const msg = get('messages')
      if (msg) {
        setGreeting(msg.greeting as string || '')
        setGreetingEnabled(msg.greeting_enabled !== false)
        setAutoreply(msg.autoreply as string || '')
        setAutoreplyEnabled(msg.autoreply_enabled !== false)
        setAutoreplyDeleteSec(String(msg.autoreply_delete_sec || '0'))
      }

      const remna = get('remnawave_integration')
      if (remna) { setRemnaUrl(remna.panel_url as string || ''); setRemnaToken(remna.api_token as string || '') }

      const solo = get('solobot_integration')
      if (solo) { setSoloUrl(solo.api_url as string || ''); setSoloKey(solo.api_key as string || ''); setSoloAdminId(solo.admin_tg_id as string || ''); setSoloUsername(solo.bot_username as string || '') }

      const oauth = get('telegram_oauth')
      if (oauth) {
        setTgOAuthEnabled(oauth.enabled as boolean || false)
        setTgOAuthBot(oauth.bot_username as string || '')
        setTgOAuthToken(oauth.bot_token as string || '')
      }
    } catch { showToast('Ошибка загрузки', false) }
    finally { setLoading(false) }
  }

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 2500)
  }

  const save = async () => {
    setSaving(true)
    try {
      await Promise.all([
        api.upsertSetting({ key: 'panel_mode', value_json: { mode: panelMode } }),
        api.upsertSetting({ key: 'app_branding', value_json: { name: appName, description: appDesc, page_title: pageTitle, favicon_url: faviconUrl } }),
        api.upsertSetting({ key: 'support_bot', value_json: { username: botUsername, token: botToken } }),
        // Also save token in format expected by bot service
        api.upsertSetting({ key: 'telegram_bot_token', value_json: { token: botToken } }),
        api.upsertSetting({ key: 'messages', value_json: { greeting, greeting_enabled: greetingEnabled, autoreply, autoreply_enabled: autoreplyEnabled, autoreply_delete_sec: parseInt(autoreplyDeleteSec) || 0 } }),
        api.upsertSetting({ key: 'remnawave_integration', value_json: { panel_url: remnaUrl, api_token: remnaToken } }),
        api.upsertSetting({ key: 'solobot_integration', value_json: { bot_username: soloUsername, api_url: soloUrl, api_key: soloKey, admin_tg_id: soloAdminId } }),
        api.upsertSetting({ key: 'telegram_oauth', value_json: { enabled: tgOAuthEnabled, bot_username: tgOAuthBot, bot_token: tgOAuthToken } }),
      ])
      onBrandingChange?.(appName, appDesc, pageTitle, faviconUrl)
      onPanelModeChange?.(panelMode)
      showToast('Сохранено', true)
    } catch { showToast('Ошибка', false) }
    finally { setSaving(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <div className="relative">
        <div className="w-12 h-12 rounded-full border-2 border-white/5" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-2 border-transparent border-t-white/40 animate-spin" />
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-3 rounded-xl backdrop-blur-xl border ${toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} text-sm font-medium animate-in slide-in-from-top-2 fade-in duration-200`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Настройки</h1>
        <p className="text-white/40 mt-1">Конфигурация системы и интеграций</p>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel Mode */}
        <div className="lg:col-span-2 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] via-transparent to-transparent p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[14px] font-semibold text-white">Режим панели</div>
              <div className="text-[12px] text-white/50 mt-1">
                В тестовом режиме данные интеграций не требуются, доступен один демо-чат.
              </div>
            </div>
            <div className="flex items-center gap-2 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setPanelMode('prod')}
                disabled={saving}
                className={`px-3 h-9 rounded-lg text-[12px] font-medium transition-all ${panelMode === 'prod' ? 'bg-white text-black' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}`}
              >
                Прод
              </button>
              <button
                type="button"
                onClick={() => setPanelMode('test')}
                disabled={saving}
                className={`px-3 h-9 rounded-lg text-[12px] font-medium transition-all ${panelMode === 'test' ? 'bg-amber-400 text-black' : 'text-white/60 hover:text-white hover:bg-white/[0.06]'}`}
              >
                Тестовый
              </button>
            </div>
          </div>
          {panelMode === 'test' && (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[12px] text-amber-200/80">
              Тестовый режим: Solobot, Remnawave и бот поддержки отключены. Ответы в чате — «Тестовое сообщение».
            </div>
          )}
        </div>

        {/* Branding */}
        <CollapsibleCard
          id="branding"
          icon={Icon.brand}
          title="Брендинг"
          subtitle="Название и описание"
          status={appName ? 'active' : 'warning'}
          color="from-violet-500/[0.08] to-transparent"
          expanded={expanded.has('branding')}
          onToggle={toggleCard}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input label="Название" value={appName} onChange={setAppName} placeholder="Support Console" disabled={saving} hint="Отображается в шапке панели" />
            <Input label="Описание" value={appDesc} onChange={setAppDesc} placeholder="Premium support system" disabled={saving} hint="Подзаголовок на странице входа" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <Input label="Заголовок вкладки" value={pageTitle} onChange={setPageTitle} placeholder="Support Panel" disabled={saving} hint="Название во вкладке браузера" />
            <Input label="Favicon URL" value={faviconUrl} onChange={setFaviconUrl} placeholder="/static/favicon.ico" disabled={saving} hint="Иконка во вкладке браузера" />
          </div>
          {faviconUrl && (
            <div className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <img src={faviconUrl} alt="Favicon preview" className="w-8 h-8 rounded" onError={(e) => (e.currentTarget.style.display = 'none')} />
              <span className="text-[12px] text-white/40">Предпросмотр favicon</span>
            </div>
          )}
        </CollapsibleCard>

        {/* Support Bot */}
        <CollapsibleCard
          id="bot"
          icon={Icon.bot}
          title="Бот поддержки"
          subtitle="Telegram бот для клиентов"
          status={panelMode === 'test' ? 'off' : botUsername && botToken ? 'active' : 'warning'}
          color="from-sky-500/[0.08] to-transparent"
          expanded={expanded.has('bot')}
          onToggle={toggleCard}
        >
          <Input label="Username" value={panelMode === 'test' ? '' : botUsername} onChange={setBotUsername} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : '@support_bot'} disabled={saving || panelMode === 'test'} />
          <Input label="Token" value={panelMode === 'test' ? '' : botToken} onChange={setBotToken} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : '123456789:ABC...'} secret disabled={saving || panelMode === 'test'} hint={panelMode === 'test' ? 'Отключено в тестовом режиме' : 'Получите у @BotFather'} />
        </CollapsibleCard>

        {/* Remnawave */}
        <CollapsibleCard
          id="remnawave"
          icon={Icon.sparkle}
          title="Remnawave"
          subtitle="Интеграция с панелью"
          status={panelMode === 'test' ? 'off' : remnaUrl && remnaToken ? 'active' : 'warning'}
          color="from-cyan-500/[0.08] to-transparent"
          expanded={expanded.has('remnawave')}
          onToggle={toggleCard}
        >
          <Input label="URL панели" value={panelMode === 'test' ? '' : remnaUrl} onChange={setRemnaUrl} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : 'https://panel.example.com'} disabled={saving || panelMode === 'test'} />
          <Input label="API Token" value={panelMode === 'test' ? '' : remnaToken} onChange={setRemnaToken} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : 'eyJhbGc...'} secret disabled={saving || panelMode === 'test'} />
        </CollapsibleCard>

        {/* Solobot */}
        <CollapsibleCard
          id="solobot"
          icon={Icon.bolt}
          title="Solobot"
          subtitle="Синхронизация с API"
          status={panelMode === 'test' ? 'off' : soloUrl && soloKey && soloAdminId ? 'active' : 'warning'}
          color="from-amber-500/[0.08] to-transparent"
          expanded={expanded.has('solobot')}
          onToggle={toggleCard}
        >
          <Input label="Bot Username" value={panelMode === 'test' ? '' : soloUsername} onChange={setSoloUsername} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : 'solobot'} disabled={saving || panelMode === 'test'} hint={panelMode === 'test' ? 'Отключено в тестовом режиме' : "Username бота без @, для кнопки 'Открыть в боте'"} />
          <Input label="API URL" value={panelMode === 'test' ? '' : soloUrl} onChange={setSoloUrl} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : 'https://api.solobot.com'} disabled={saving || panelMode === 'test'} />
          <Input label="API Key" value={panelMode === 'test' ? '' : soloKey} onChange={setSoloKey} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : 'sk_live_...'} secret disabled={saving || panelMode === 'test'} />
          <Input label="Admin Telegram ID" value={panelMode === 'test' ? '' : soloAdminId} onChange={setSoloAdminId} placeholder={panelMode === 'test' ? 'Не требуется в тестовом режиме' : '431503783'} disabled={saving || panelMode === 'test'} hint={panelMode === 'test' ? 'Отключено в тестовом режиме' : 'ID администратора для верификации токена'} />
        </CollapsibleCard>
      </div>

      {/* Messages - Full Width */}
      <div className="mt-4">
        <CollapsibleCard
          id="messages"
          icon={Icon.message}
          title="Сообщения"
          subtitle="Приветствие, автоответ и настройки"
          status={greeting || (autoreply && autoreplyEnabled) ? 'active' : 'warning'}
          color="from-emerald-500/[0.08] to-transparent"
          expanded={expanded.has('messages')}
          onToggle={toggleCard}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-5">
              {/* Greeting toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <div className="text-[13px] font-medium text-white">Приветствие</div>
                  <div className="text-[11px] text-white/40 mt-0.5">Отправлять при /start</div>
                </div>
                <Toggle enabled={greetingEnabled} onChange={setGreetingEnabled} disabled={saving} />
              </div>
              <Textarea
                label="Приветственное сообщение"
                value={greeting}
                onChange={setGreeting}
                placeholder="<b>Добро пожаловать!</b>&#10;Отправляется при /start"
                hint="HTML: <b>, <i>, <code>, <a href>"
                rows={4}
                disabled={saving || !greetingEnabled}
              />
            </div>
            <div className="space-y-5">
              {/* Auto-reply toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div>
                  <div className="text-[13px] font-medium text-white">Автоответ</div>
                  <div className="text-[11px] text-white/40 mt-0.5">Отправлять при первом сообщении</div>
                </div>
                <Toggle enabled={autoreplyEnabled} onChange={setAutoreplyEnabled} disabled={saving} />
              </div>
              <Textarea
                label="Текст автоответа"
                value={autoreply}
                onChange={setAutoreply}
                placeholder="Спасибо за обращение! Мы ответим в ближайшее время."
                hint="Отправляется автоматически при первом сообщении"
                rows={2}
                disabled={saving || !autoreplyEnabled}
              />
              <Input
                label="Удалить автоответ через (сек)"
                value={autoreplyDeleteSec}
                onChange={setAutoreplyDeleteSec}
                placeholder="0"
                hint="0 = не удалять автоматически"
                disabled={saving || !autoreplyEnabled}
              />
            </div>
          </div>
        </CollapsibleCard>
      </div>

      {/* Telegram OAuth - Full Width */}
      <div className="mt-4">
        <div className={`rounded-2xl border transition-all duration-300 overflow-hidden ${tgOAuthEnabled ? 'border-blue-500/20 bg-gradient-to-br from-blue-500/[0.05] to-transparent' : 'border-white/[0.06] bg-white/[0.01]'}`}>
          <div
            onClick={() => setTgOAuthExpanded(!tgOAuthExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${tgOAuthEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-white/[0.05] text-white/50'}`}>
                {Icon.telegram}
              </div>
              <div className="text-left">
                <h3 className="text-[15px] font-semibold text-white">Вход через Telegram</h3>
                <p className="text-[12px] text-white/40 mt-0.5">OAuth авторизация для администраторов</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Badge status={tgOAuthEnabled ? (tgOAuthBot && tgOAuthToken ? 'active' : 'warning') : 'off'} />
              <Toggle enabled={tgOAuthEnabled} onChange={setTgOAuthEnabled} disabled={saving} />
              <span className={`transition-transform duration-300 ${tgOAuthExpanded ? 'rotate-180' : ''}`}>
                {Icon.chevron}
              </span>
            </div>
          </div>

          <div className={`grid transition-all duration-300 ease-in-out ${tgOAuthExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="overflow-hidden">
              <div className="px-6 pb-6 pt-2 border-t border-white/[0.04]">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                  <Input
                    label="Username бота"
                    value={tgOAuthBot}
                    onChange={setTgOAuthBot}
                    placeholder="@auth_bot"
                    hint="Может отличаться от бота поддержки"
                    disabled={saving}
                  />
                  <Input
                    label="Token бота"
                    value={tgOAuthToken}
                    onChange={setTgOAuthToken}
                    placeholder="123456789:ABC..."
                    secret
                    hint="Для верификации Telegram Login"
                    disabled={saving}
                  />
                </div>
                <div className="mt-5 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 space-y-3">
                  <p className="text-[12px] text-blue-300/70 leading-relaxed">
                    <span className="font-semibold text-blue-300">Telegram OAuth</span> — вход администраторов через Telegram.
                    Можно использовать тот же бот, что и для поддержки, или создать отдельный.
                  </p>
                  <div className="pt-3 border-t border-blue-500/10">
                    <p className="text-[11px] font-medium text-amber-300 mb-2">⚠️ Важно: настройка домена</p>
                    <ol className="text-[11px] text-white/50 space-y-1 list-decimal list-inside">
                      <li>Откройте <span className="text-blue-300">@BotFather</span> в Telegram</li>
                      <li>Отправьте команду <code className="px-1.5 py-0.5 rounded bg-white/10 text-blue-300 font-mono">/setdomain</code></li>
                      <li>Выберите бота для авторизации</li>
                      <li>Укажите домен: <code className="px-1.5 py-0.5 rounded bg-white/10 text-cyan-300 font-mono">{window.location.hostname}</code></li>
                    </ol>
                    <p className="text-[10px] text-white/30 mt-2">Без этой настройки Telegram Login не будет работать.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Save Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-ink-900 via-ink-900/95 to-transparent pointer-events-none">
        <div className="max-w-5xl mx-auto flex justify-end gap-3 pointer-events-auto">
          <button
            onClick={() => setResetConfirm(true)}
            disabled={saving || resetting}
            className="h-11 px-5 rounded-xl border border-white/[0.08] text-sm font-medium text-white/60 hover:text-white hover:bg-white/[0.04] hover:border-white/[0.12] disabled:opacity-40 transition-all flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            {resetting ? 'Сброс...' : 'Сбросить'}
          </button>
          <button
            onClick={save}
            disabled={saving || resetting}
            className="h-11 px-6 rounded-xl bg-white text-black text-sm font-semibold hover:bg-white/90 disabled:opacity-40 transition-all flex items-center gap-2 shadow-lg shadow-white/10"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-[380px] max-w-full rounded-2xl border border-white/10 bg-gradient-to-b from-ink-800 to-ink-900 p-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
              </div>
              <div>
                <div className="text-base font-semibold text-white">Сбросить изменения?</div>
                <div className="text-xs text-white/50">Несохранённые данные будут потеряны</div>
              </div>
            </div>
            <div className="mt-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
              <div className="text-xs text-white/60">
                Все несохранённые изменения будут <span className="text-amber-300">отменены</span> и загружены последние сохранённые настройки.
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 rounded-xl border border-white/10 py-2 text-sm text-white/70 hover:bg-white/10 transition-colors"
                onClick={() => setResetConfirm(false)}
              >
                Отмена
              </button>
              <button
                className="flex-1 rounded-xl bg-amber-500 py-2 text-sm text-white font-medium hover:bg-amber-600 transition-colors"
                onClick={async () => {
                  setResetConfirm(false)
                  setResetting(true)
                  try {
                    await load()
                    showToast('Настройки сброшены', true)
                  } finally {
                    setResetting(false)
                  }
                }}
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}
