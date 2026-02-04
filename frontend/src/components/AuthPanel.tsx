import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../lib/api'

interface AuthPanelProps {
  onAuthSuccess: () => void
  appName: string
  appDescription: string
}

interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

declare global {
  interface Window {
    TelegramLoginWidgetCb?: (user: TelegramUser) => void
  }
}

export default function AuthPanel({ onAuthSuccess, appName, appDescription }: AuthPanelProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [telegramOAuth, setTelegramOAuth] = useState<{ enabled: boolean; bot_username: string; bot_id: string } | null>(null)
  const telegramWidgetRef = useRef<HTMLDivElement>(null)

  // Handle Telegram login callback
  const handleTelegramAuth = useCallback(async (user: TelegramUser) => {
    setLoading(true)
    setError(null)
    try {
      await api.telegramOAuthLogin(user)
      onAuthSuccess()
    } catch (err: any) {
      setError(err.message || 'Ошибка авторизации через Telegram')
      setLoading(false)
    }
  }, [onAuthSuccess])

  useEffect(() => {
    api.getPublicTelegramOAuth().then(setTelegramOAuth).catch(() => {})
  }, [])

  // Load Telegram Login Widget
  useEffect(() => {
    if (!telegramOAuth?.enabled || !telegramOAuth?.bot_username || !telegramWidgetRef.current) return

    // Set global callback
    window.TelegramLoginWidgetCb = handleTelegramAuth

    // Clean username (remove @)
    const botUsername = telegramOAuth.bot_username.replace('@', '')

    // Create script element
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '12')
    script.setAttribute('data-onauth', 'TelegramLoginWidgetCb(user)')
    script.setAttribute('data-request-access', 'write')
    script.async = true

    // Clear previous widget and add new one
    telegramWidgetRef.current.innerHTML = ''
    telegramWidgetRef.current.appendChild(script)

    return () => {
      delete window.TelegramLoginWidgetCb
    }
  }, [telegramOAuth, handleTelegramAuth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!username || !password) {
        setError('Заполните все поля')
        setLoading(false)
        return
      }

      await api.login(username, password)
      setUsername('')
      setPassword('')
      onAuthSuccess()
    } catch (err: any) {
      setError(err.message || 'Неверный логин или пароль')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex items-center justify-center px-3 sm:px-4 py-6 sm:py-10 pb-[calc(2rem+env(safe-area-inset-bottom))] bg-[#0b0f17] relative overflow-hidden overflow-y-auto">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Gradient orbs */}
        <div className="absolute top-0 left-1/4 w-[520px] h-[520px] bg-gradient-to-br from-slate-500/18 via-blue-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[460px] h-[460px] bg-gradient-to-tl from-indigo-500/18 via-slate-500/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[720px] h-[720px] bg-gradient-to-r from-slate-500/6 to-blue-500/6 rounded-full blur-3xl animate-pulse" />

        {/* Grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:70px_70px]" />

        {/* Floating particles */}
        <div className="absolute top-1/4 left-1/3 w-2 h-2 bg-slate-300/25 rounded-full animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }} />
        <div className="absolute top-2/3 right-1/3 w-1.5 h-1.5 bg-blue-300/25 rounded-full animate-bounce" style={{ animationDelay: '1s', animationDuration: '4s' }} />
        <div className="absolute bottom-1/4 left-1/2 w-1 h-1 bg-indigo-300/35 rounded-full animate-bounce" style={{ animationDelay: '2s', animationDuration: '3.5s' }} />
      </div>

      <div className="w-full !max-w-[520px] relative z-10">
        {/* Logo & Branding */}
        <div className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-slate-400/20 via-blue-400/15 to-indigo-400/20 border border-white/10 mb-4 sm:mb-5 backdrop-blur-xl shadow-2xl shadow-black/30">
            <svg className="w-6 h-6 sm:w-8 sm:h-8 text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-xl sm:text-3xl font-display font-semibold mb-2 bg-gradient-to-r from-white via-slate-100 to-blue-100 bg-clip-text text-transparent tracking-tight">
            {appName}
          </h1>
          <p className="text-white/45 text-xs sm:text-sm">{appDescription}</p>
        </div>

        {/* Main Card */}
        <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.05] to-white/[0.015] backdrop-blur-2xl p-4 sm:p-6 shadow-2xl shadow-black/40 login-in">
          {/* Title */}
          <div className="mb-5">
            <h2 className="text-base sm:text-lg font-semibold text-white mb-1">Добро пожаловать</h2>
            <p className="text-white/45 text-xs sm:text-sm">Войдите в панель управления</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">
                Логин
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Введите логин"
                  disabled={loading}
                  className="w-full rounded-xl bg-white/[0.035] border border-white/[0.08] pl-10 pr-4 py-2.5 sm:py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400/40 focus:bg-white/[0.05] transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-white/50 text-xs font-medium mb-1.5 uppercase tracking-wider">
                Пароль
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  disabled={loading}
                  className="w-full rounded-xl bg-white/[0.035] border border-white/[0.08] pl-10 pr-4 py-2.5 sm:py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-400/40 focus:bg-white/[0.05] transition-all disabled:opacity-50"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-gradient-to-r from-rose-500/20 via-rose-500/15 to-rose-500/20 border border-rose-500/30 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
                      <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-rose-200 font-medium text-sm">{error}</p>
                    </div>
                    <button
                      onClick={() => setError(null)}
                      className="flex-shrink-0 text-rose-400/60 hover:text-rose-300 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 sm:h-11 rounded-xl bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 hover:from-slate-600 hover:via-slate-500 hover:to-slate-400 text-white text-sm font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/30 hover:shadow-black/40 hover:scale-[1.01] active:scale-[0.99] mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Вход...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>Войти</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </span>
              )}
            </button>
          </form>

          {/* Telegram OAuth */}
          {telegramOAuth?.enabled && telegramOAuth?.bot_username && (
            <>
              {/* Divider */}
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <span className="text-white/30 text-xs uppercase tracking-wider">или</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>

              {/* Telegram Widget Container */}
              <div className="flex justify-center">
                <div ref={telegramWidgetRef} className="telegram-login-widget" />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-white/20 text-xs">
            Защищённая панель управления
          </p>
        </div>
      </div>
    </div>
  )
}
