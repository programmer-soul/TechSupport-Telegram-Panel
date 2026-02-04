export const API_BASE = ''

export type Chat = {
  id: string
  tg_id: number
  tg_username?: string | null
  first_name?: string | null
  last_name?: string | null
  status: string
  unread_count: number
  note?: string | null
  assigned_user_id?: string | null
  escalated_to_user_id?: string | null
  created_at?: string | null
  last_message_at?: string | null
  last_message_preview?: string | null
}

export type Message = {
  id: string
  chat_id: string
  direction: 'IN' | 'OUT'
  type: string
  text?: string | null
  telegram_message_id?: number | null
  reply_to_telegram_message_id?: number | null
  reply_to_message_id?: string | null
  is_edited?: boolean | null
  edited_at?: string | null
  sent_by_user_id?: string | null
  created_at?: string
  attachments?: AttachmentData[]
  inline_buttons?: InlineButton[][] | null
  // Forward info
  forward_from_name?: string | null
  forward_from_username?: string | null
  forward_date?: string | null
}

export type ExternalProfile = {
  user?: Record<string, unknown> | null
  keys?: any[] | null
  payments?: any[] | null
  ban_status?: any | null
  tariffs?: any[] | null
  referrals?: any[] | null
  remnawave?: any | null
  remnawave_devices?: any[] | null
}

export type InlineButton = { text: string; url: string }
export type AttachmentData = { url?: string; local_path?: string; mime?: string; name?: string; size?: number }

export type Template = { 
  id: number
  title: string
  body: string
  attachments?: AttachmentData[] | null
  inline_buttons?: InlineButton[][] | null
}
export type Broadcast = {
  id: number
  body: string
  status: string
  target_statuses?: string[] | null
  stats?: { sent: number; failed: number } | null
  attachments?: AttachmentData[] | null
  inline_buttons?: InlineButton[][] | null
  created_at?: string
  updated_at?: string
}
export type Admin = { 
  id: string
  telegram_user_id: number
  username: string
  role: string
  is_active: boolean
  telegram_oauth_enabled?: boolean
  created_at?: string
  updated_at?: string
}
export type Setting = { key: string; value_json: any }

export type PaginatedResponse<T> = {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

// Encode cursor for pagination (matches backend format)
const encodeCursor = (dateStr: string | null | undefined, id: string): string | null => {
  if (!dateStr) return null
  const payload = `${dateStr}|${id}`
  return btoa(payload)
}

let authErrorHandler: ((status: number) => void) | null = null
let stepupHandler: (() => void) | null = null

export const setAuthErrorHandler = (handler: (status: number) => void) => {
  authErrorHandler = handler
}

export const setStepupHandler = (handler: () => void) => {
  stepupHandler = handler
}

let refreshPromise: Promise<string | null> | null = null

const getCookie = (name: string) => {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.split('=')[1]) : null
}

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshPromise) return refreshPromise
  refreshPromise = fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include'
  })
    .then(async (res) => {
      if (!res.ok) return null
      return 'ok'
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase()
  const doFetch = async (tokenOverride?: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined)
    }
    if (method !== 'GET') {
      const csrf = getCookie('csrf_token')
      if (csrf) headers['X-CSRF-Token'] = csrf
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' })
  }

  let res = await doFetch()
  if (res.status === 401) {
    const data = await res.clone().json().catch(() => null)
    if (data?.detail === 'stepup_required') {
      stepupHandler?.()
      throw new Error('stepup_required')
    }
  }
  if (res.status === 401) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      res = await doFetch(refreshed)
    }
  }
  if (res.status === 401) {
    authErrorHandler?.(res.status)
    throw new Error('Unauthorized')
  }
  if (res.status === 403) {
    throw new Error('Forbidden')
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }))
    // Support structured error responses {code, message}
    const detail = errorData?.detail
    const message = typeof detail === 'object' && detail?.message ? detail.message : 
                    typeof detail === 'string' ? detail : 
                    'Request failed'
    throw new Error(message)
  }
  if (res.status === 204) return {} as T
  return (await res.json()) as T
}

export const api = {
  // Paginated version - returns items with cursor info
  getChats: async (tab = 'active', search = '', searchScope?: string, cursor?: string, limit = 30): Promise<PaginatedResponse<Chat>> => {
    const scope = searchScope ? `&search_scope=${encodeURIComponent(searchScope)}` : ''
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    const items = await request<Chat[]>(`/api/chats?tab=${tab}&search=${encodeURIComponent(search)}${scope}&limit=${limit}${cursorParam}`)
    const lastItem = items[items.length - 1]
    const nextCursor = lastItem && items.length === limit ? encodeCursor(lastItem.last_message_at, lastItem.id) : null
    return { items, nextCursor, hasMore: items.length === limit }
  },
  getChat: (chatId: string) => request<Chat>(`/api/chats/${chatId}`),
  // Paginated version - returns items with cursor info
  getMessages: async (chatId: string, cursor?: string, limit = 50): Promise<PaginatedResponse<Message>> => {
    const cursorParam = cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''
    const items = await request<Message[]>(`/api/chats/${chatId}/messages?limit=${limit}${cursorParam}`)
    const lastItem = items[items.length - 1]
    const nextCursor = lastItem && items.length === limit ? encodeCursor(lastItem.created_at, lastItem.id) : null
    return { items, nextCursor, hasMore: items.length === limit }
  },
  sendMessage: (chatId: string, payload: Partial<Message>) =>
    request<Message>(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  deleteMessage: (chatId: string, messageId: string) =>
    request(`/api/chats/${chatId}/messages/${messageId}`, { method: 'DELETE' }),
  closeChat: (chatId: string) => request<Chat>(`/api/chats/${chatId}/close`, { method: 'POST', body: JSON.stringify({}) }),
  deleteChat: (chatId: string) => request(`/api/chats/${chatId}`, { method: 'DELETE' }),
  escalateChat: (chatId: string) => request<Chat>(`/api/chats/${chatId}/escalate`, { method: 'POST', body: JSON.stringify({}) }),
  assignChat: (chatId: string, userId?: string) =>
    request<Chat>(`/api/chats/${chatId}/assign`, { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  updateChatNote: (chatId: string, note: string | null) =>
    request<Chat>(`/api/chats/${chatId}/note`, { method: 'PATCH', body: JSON.stringify({ note }) }),
  upload: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const csrf = getCookie('csrf_token')
    let res = await fetch('/api/uploads', {
      method: 'POST',
      credentials: 'include',
      headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
      body: form
    })
    if (res.status === 401) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        const nextCsrf = getCookie('csrf_token')
        res = await fetch('/api/uploads', {
          method: 'POST',
          credentials: 'include',
          headers: nextCsrf ? { 'X-CSRF-Token': nextCsrf } : undefined,
          body: form
        })
      }
    }
    if (res.status === 401) {
      authErrorHandler?.(res.status)
      throw new Error('Unauthorized')
    }
    if (res.status === 403) {
      throw new Error('Forbidden')
    }
    if (!res.ok) throw new Error('Upload failed')
    return res.json()
  },
  getProfile: (tgId: number) => request<ExternalProfile>(`/api/external/solobot/profile/${tgId}`),
  deleteRemnawaveDevice: (userUuid: string, hwid: string) =>
    request(`/api/external/remnawave/devices/delete`, {
      method: 'POST',
      body: JSON.stringify({ userUuid, hwid })
    }),
  listTemplates: () => request<Template[]>('/api/templates'),
  createTemplate: (payload: { title: string; body: string; attachments?: AttachmentData[] | null; inline_buttons?: InlineButton[][] | null }) =>
    request<Template>('/api/templates', { method: 'POST', body: JSON.stringify(payload) }),
  updateTemplate: (id: number, payload: Partial<Template>) =>
    request<Template>(`/api/templates/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTemplate: (id: number) => request(`/api/templates/${id}`, { method: 'DELETE' }),
  listBroadcasts: () => request<Broadcast[]>('/api/broadcast'),
  createBroadcast: (payload: { body: string; target_statuses?: ('all' | 'new' | 'active' | 'closed')[]; attachments?: AttachmentData[] | null; inline_buttons?: InlineButton[][] | null }) =>
    request<Broadcast>('/api/broadcast', { method: 'POST', body: JSON.stringify(payload) }),
  listAdmins: () => request<Admin[]>('/api/admins'),
  createAdmin: (payload: { telegram_user_id: number; username?: string; role: string; is_active?: boolean; temp_password?: string }) =>
    request<Admin>('/api/admins', { method: 'POST', body: JSON.stringify(payload) }),
  updateAdmin: (id: string, payload: { username?: string; telegram_user_id?: number; role?: string; is_active?: boolean; telegram_oauth_enabled?: boolean; temp_password?: string }) =>
    request<Admin>(`/api/admins/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAdmin: (id: string) => request(`/api/admins/${id}`, { method: 'DELETE' }),
  getPublicBranding: async () => {
    const res = await fetch('/api/settings/public/branding')
    if (!res.ok) return { name: 'Support Bot Console', description: 'Premium support console' }
    return (await res.json()) as { name: string; description: string; page_title?: string; favicon_url?: string }
  },
  getPublicTelegramOAuth: async () => {
    const res = await fetch('/api/settings/public/telegram-oauth')
    if (!res.ok) return { enabled: false, bot_username: '', bot_id: '' }
    return (await res.json()) as { enabled: boolean; bot_username: string; bot_id: string }
  },
  listSettings: () => request<Setting[]>('/api/settings'),
  upsertSetting: (payload: Setting) => request<Setting>('/api/settings', { method: 'POST', body: JSON.stringify(payload) }),
  deleteSetting: (key: string) => request(`/api/settings/${key}`, { method: 'DELETE' }),
  me: async () => {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) throw new Error('Unauthorized')
    return (await res.json()) as { id: string; telegram_user_id: number; role: string; must_setup_totp: boolean; must_change_password?: boolean; username?: string }
  },
  telegramVerify: (payload: any) =>
    request<{ pending_login_id: string }>('/api/auth/telegram/verify', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  totpStatus: (pending_login_id: string) =>
    request<{ enabled: boolean; temp_password_available: boolean }>('/api/auth/totp/status', {
      method: 'POST',
      body: JSON.stringify({ pending_login_id })
    }),
  tempPasswordVerify: (pending_login_id: string, password: string) =>
    request<{ ok: boolean }>('/api/auth/temp_password/verify', {
      method: 'POST',
      body: JSON.stringify({ pending_login_id, password })
    }),
  telegramBotId: () => request<{ bot_id: number }>('/api/auth/telegram/bot_id'),
  webauthnAuthOptions: (pending_login_id: string) =>
    request<{ options: any; has_credentials: boolean }>('/api/auth/webauthn/auth/options', {
      method: 'POST',
      body: JSON.stringify({ pending_login_id })
    }),
  webauthnAuthVerify: (pending_login_id: string, credential: any) =>
    request<{ ok: boolean }>('/api/auth/webauthn/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ pending_login_id, credential })
    }),
  webauthnRegisterOptions: (pending_login_id?: string | null) =>
    request<{ options: any }>('/api/auth/webauthn/register/options', {
      method: 'POST',
      body: pending_login_id ? JSON.stringify({ pending_login_id }) : '{}'
    }),
  webauthnRegisterVerify: (pending_login_id: string | null, credential: any) =>
    request<{ ok: boolean }>('/api/auth/webauthn/register/verify', {
      method: 'POST',
      body: pending_login_id ? JSON.stringify({ pending_login_id, credential }) : JSON.stringify({ credential })
    }),
  webauthnDelete: (credential_id: string) =>
    request<{ ok: boolean }>(`/api/auth/webauthn/credential/${credential_id}`, {
      method: 'DELETE'
    }),
  totpVerify: (pending_login_id: string, code: string) =>
    request<{ ok: boolean }>('/api/auth/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ pending_login_id, code })
    }),
  totpSetupStart: () =>
    request<{ secret: string; provisioning_uri: string }>('/api/auth/totp/setup/start', {
      method: 'POST',
      body: '{}'
    }),
  totpSetupVerify: (code: string) =>
    request<{ ok: boolean }>('/api/auth/totp/setup/verify', {
      method: 'POST',
      body: JSON.stringify({ code })
    }),
  recoveryCodesGenerate: () =>
    request<{ codes: string[] }>('/api/auth/recovery_codes/generate', {
      method: 'POST',
      body: '{}'
    }),
  recoveryCodeVerify: (pending_login_id: string, code: string) =>
    request<{ ok: boolean }>('/api/auth/recovery_codes/verify', {
      method: 'POST',
      body: JSON.stringify({ pending_login_id, code })
    }),
  stepupWebauthnOptions: () => request<{ options: any; has_credentials: boolean }>('/api/auth/stepup/webauthn/options', { method: 'POST', body: '{}' }),
  stepupWebauthnVerify: (credential: any) =>
    request<{ ok: boolean }>('/api/auth/stepup/webauthn/verify', { method: 'POST', body: JSON.stringify({ credential }) }),
  stepupTotpVerify: (code: string) =>
    request<{ ok: boolean }>('/api/auth/stepup/totp/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  stepupTempPasswordVerify: (code: string) =>
    request<{ ok: boolean }>('/api/auth/stepup/temp_password/verify', { method: 'POST', body: JSON.stringify({ code }) }),
  securityStatus: () =>
    request<{
      passkeys: { enabled: boolean; count: number; list: Array<{ id: string; created_at: string }> }
      totp: { enabled: boolean }
      recovery_codes: { enabled: boolean; count: number }
    }>('/api/auth/security/status', { method: 'POST', body: '{}' }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  logoutAll: () => request('/api/auth/logout_all', { method: 'POST', body: '{}' }),
  login: (username: string, password: string) =>
    request<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    }),
  telegramOAuthLogin: (user: { id: number; first_name?: string; last_name?: string; username?: string; auth_date: number; hash: string }) =>
    request<{ ok: boolean }>('/api/auth/telegram/oauth', {
      method: 'POST',
      body: JSON.stringify(user)
    }),
  changePassword: (newPassword: string, oldPassword?: string, newUsername?: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword, old_password: oldPassword || '', new_username: newUsername })
    }),
  updateUsername: (newUsername: string) =>
    request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ new_username: newUsername })
    }),
  toggleTelegramOAuth: (enabled: boolean) =>
    request<{ ok: boolean; telegram_oauth_enabled: boolean }>('/api/auth/telegram-oauth/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled })
    }),
  getTelegramOAuthStatus: () =>
    request<{ telegram_oauth_enabled: boolean }>('/api/auth/telegram-oauth/status', {
      method: 'GET'
    }),
}
