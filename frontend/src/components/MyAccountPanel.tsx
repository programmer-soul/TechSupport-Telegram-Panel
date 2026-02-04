import { useEffect, useState } from 'react'
import { api } from '../lib/api'

// Icons
const Icons = {
  user: (
    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  ),
  lock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  telegram: (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.05-.2-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z"/>
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  edit: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  ),
  spinner: (
    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  ),
  chevron: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  ),
}

// Collapsible Card Component
function Card({ title, icon, children, className = '', defaultOpen = true }: { 
  title: string; 
  icon?: React.ReactNode; 
  children: React.ReactNode; 
  className?: string;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-gradient-to-br from-white/[0.04] via-white/[0.02] to-transparent backdrop-blur-sm overflow-hidden ${className}`}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-6 py-4 border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors"
      >
        {icon && <div className="text-white/40">{icon}</div>}
        <h2 className="flex-1 text-left text-base font-semibold text-white">{title}</h2>
        <div className={`text-white/40 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
          {Icons.chevron}
        </div>
      </button>
      <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// Input Component
function Input({ label, value, onChange, placeholder, type = 'text', disabled, hint }: {
  label: string
  value: string
  onChange: (val: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  hint?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/30 focus:bg-white/[0.06] transition-all disabled:opacity-50"
      />
      {hint && <p className="text-xs text-white/30 mt-2">{hint}</p>}
    </div>
  )
}

// Toggle Component
function Toggle({ label, checked, onChange, disabled, hint }: {
  label: string
  checked: boolean
  onChange: (val: boolean) => void
  disabled?: boolean
  hint?: string
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label className="block text-sm font-medium text-white/80">{label}</label>
        {hint && <p className="text-xs text-white/40 mt-1">{hint}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative flex-shrink-0 w-12 h-7 rounded-full transition-all duration-300 ${
          checked 
            ? 'bg-gradient-to-r from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/25' 
            : 'bg-white/10'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-lg transition-all duration-300 ${
          checked ? 'right-1' : 'left-1'
        }`} />
      </button>
    </div>
  )
}

// Alert Component
function Alert({ type, message, onClose }: { type: 'success' | 'error'; message: string; onClose?: () => void }) {
  const styles = {
    success: 'from-emerald-500/20 via-emerald-500/15 to-emerald-500/20 border-emerald-500/30',
    error: 'from-rose-500/20 via-rose-500/15 to-rose-500/20 border-rose-500/30',
  }
  const iconStyles = {
    success: 'bg-emerald-500/20 text-emerald-400',
    error: 'bg-rose-500/20 text-rose-400',
  }
  const textStyles = {
    success: 'text-emerald-300/80',
    error: 'text-rose-300/80',
  }
  
  return (
    <div className={`rounded-2xl bg-gradient-to-r ${styles[type]} border px-5 py-4 animate-in fade-in slide-in-from-top-2 duration-300`}>
      <div className="flex items-center gap-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${iconStyles[type]} flex items-center justify-center`}>
          {type === 'success' ? Icons.check : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>
        <p className={`flex-1 text-sm ${textStyles[type]}`}>{message}</p>
        {onClose && (
          <button onClick={onClose} className="flex-shrink-0 text-white/40 hover:text-white/60 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

export default function MyAccountPanel() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [originalUsername, setOriginalUsername] = useState('')
  const [telegramId, setTelegramId] = useState<number | null>(null)
  const [telegramOAuthEnabled, setTelegramOAuthEnabled] = useState(false)
  const [originalTelegramOAuth, setOriginalTelegramOAuth] = useState(false)
  
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    if (alert) {
      const timeout = setTimeout(() => setAlert(null), 5000)
      return () => clearTimeout(timeout)
    }
  }, [alert])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const user = await api.me()
      setUsername(user.username || '')
      setOriginalUsername(user.username || '')
      setTelegramId(user.telegram_user_id || null)
      
      // Get telegram oauth status
      const status = await api.getTelegramOAuthStatus()
      setTelegramOAuthEnabled(status.telegram_oauth_enabled)
      setOriginalTelegramOAuth(status.telegram_oauth_enabled)
    } catch (err: any) {
      setAlert({ type: 'error', message: 'Не удалось загрузить профиль' })
    } finally {
      setLoading(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!username.trim()) {
      setAlert({ type: 'error', message: 'Логин не может быть пустым' })
      return
    }

    setSaving(true)
    try {
      // Save username if changed
      if (username !== originalUsername) {
        await api.updateUsername(username)
        setOriginalUsername(username)
      }
      
      // Save telegram oauth if changed
      if (telegramOAuthEnabled !== originalTelegramOAuth) {
        await api.toggleTelegramOAuth(telegramOAuthEnabled)
        setOriginalTelegramOAuth(telegramOAuthEnabled)
      }
      
      setAlert({ type: 'success', message: 'Профиль успешно сохранён' })
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Не удалось сохранить профиль' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    if (!oldPassword) {
      setAlert({ type: 'error', message: 'Введите текущий пароль' })
      return
    }
    if (newPassword.length < 6) {
      setAlert({ type: 'error', message: 'Новый пароль должен содержать минимум 6 символов' })
      return
    }
    if (newPassword !== confirmPassword) {
      setAlert({ type: 'error', message: 'Пароли не совпадают' })
      return
    }

    setSaving(true)
    try {
      await api.changePassword(newPassword, oldPassword)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setAlert({ type: 'success', message: 'Пароль успешно изменён' })
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message || 'Не удалось изменить пароль' })
    } finally {
      setSaving(false)
    }
  }

  const hasProfileChanges = username !== originalUsername || telegramOAuthEnabled !== originalTelegramOAuth
  const hasPasswordInput = oldPassword || newPassword || confirmPassword

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-white/50">
          {Icons.spinner}
          <span>Загрузка...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin">
      <div className="min-h-full px-4 py-6 sm:p-6 md:p-8 bg-gradient-to-br from-[#0a0e17] via-[#0d1220] to-[#0a0e17]">
        <div className="max-w-2xl mx-auto space-y-6 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center border border-white/[0.08]">
                {Icons.user}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-white">Мой профиль</h1>
                <p className="text-white/40 text-sm">Управляйте настройками вашего аккаунта</p>
              </div>
            </div>
          </div>

          {/* Alert */}
          {alert && (
            <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />
          )}

        {/* Profile Card */}
        <Card title="Профиль" icon={Icons.user}>
          <div className="space-y-6">
            <Input
              label="Логин"
              value={username}
              onChange={setUsername}
              placeholder="Введите логин"
              hint="Уникальный логин для входа в систему"
            />

            {telegramId && telegramId > 0 && (
              <div>
                <label className="block text-xs font-medium text-white/50 mb-2 uppercase tracking-wider">Telegram ID</label>
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                  <div className="text-cyan-400">{Icons.telegram}</div>
                  <span className="text-white/70 font-mono">{telegramId}</span>
                </div>
              </div>
            )}

            <div className="pt-2">
              <Toggle
                label="Вход через Telegram"
                checked={telegramOAuthEnabled}
                onChange={setTelegramOAuthEnabled}
                hint="Позволяет входить в панель через виджет Telegram на странице авторизации"
              />
            </div>

            <div className="pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={saving || !hasProfileChanges}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 hover:from-cyan-400 hover:via-blue-400 hover:to-purple-500 text-white font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
              >
                {saving ? Icons.spinner : Icons.check}
                <span>Сохранить изменения</span>
              </button>
            </div>
          </div>
        </Card>

        {/* Password Card */}
        <Card title="Смена пароля" icon={Icons.lock}>
          <div className="space-y-5">
            <Input
              label="Текущий пароль"
              value={oldPassword}
              onChange={setOldPassword}
              type="password"
              placeholder="Введите текущий пароль"
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Input
                label="Новый пароль"
                value={newPassword}
                onChange={setNewPassword}
                type="password"
                placeholder="Минимум 6 символов"
              />
              <Input
                label="Подтверждение пароля"
                value={confirmPassword}
                onChange={setConfirmPassword}
                type="password"
                placeholder="Повторите пароль"
              />
            </div>

            <div className="pt-4">
              <button
                onClick={handleChangePassword}
                disabled={saving || !hasPasswordInput}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white font-medium transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? Icons.spinner : Icons.lock}
                <span>Изменить пароль</span>
              </button>
            </div>
          </div>
        </Card>

        {/* Info Card */}
        <div className="rounded-2xl border border-white/[0.04] bg-white/[0.02] p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-white/60 text-sm leading-relaxed">
                Если вы забыли пароль или хотите изменить роль аккаунта, обратитесь к администратору системы.
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
