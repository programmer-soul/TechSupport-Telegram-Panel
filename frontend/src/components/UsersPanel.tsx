import { useEffect, useState } from 'react'
import { Admin, api } from '../lib/api'

// Icons
const Icons = {
  plus: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>,
  edit: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  trash: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
  lock: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
  user: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
  check: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" /></svg>,
  close: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>,
  copy: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
  refresh: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
}

// Modal Component
function Modal({ isOpen, title, children, onClose }: { isOpen: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl w-[420px] max-w-[95vw] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white/70 transition-colors">
            {Icons.close}
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

// Confirm Modal Component
function ConfirmModal({ isOpen, title, message, confirmText, cancelText, danger, onConfirm, onCancel }: {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className={`w-14 h-14 mx-auto mb-4 rounded-full flex items-center justify-center ${danger ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
            {danger ? (
              <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            ) : (
              <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-sm text-white/60 mb-6">{message}</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-all"
            >
              {cancelText || 'Отмена'}
            </button>
            <button
              onClick={onConfirm}
              className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-500 hover:bg-violet-600'}`}
            >
              {confirmText || 'Подтвердить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Alert Modal Component
function AlertModal({ isOpen, title, message, onClose }: {
  isOpen: boolean
  title: string
  message: string
  onClose: () => void
}) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
          <p className="text-sm text-white/60 mb-6">{message}</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-sm font-medium text-white transition-all"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}

// Input Component
function Input({ label, value, onChange, placeholder, type = 'text', disabled, hint }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/70 mb-2">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all disabled:opacity-50"
      />
      {hint && <p className="text-xs text-white/40 mt-1">{hint}</p>}
    </div>
  )
}

// Select Component
function Select({ label, value, onChange, options, disabled }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-white/70 mb-2">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all disabled:opacity-50"
      >
        {options.map((opt: any) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Toggle Component
function Toggle({ label, checked, onChange, disabled, hint }: any) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-white/70">{label}</label>
        <button
          onClick={() => !disabled && onChange(!checked)}
          disabled={disabled}
          className={`relative w-10 h-6 rounded-full transition-all duration-300 ${checked ? 'bg-emerald-500' : 'bg-white/10'} disabled:opacity-50`}
        >
          <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300 ${checked ? 'right-1' : 'left-1'}`} />
        </button>
      </div>
      {hint && <p className="text-xs text-white/40 mt-1">{hint}</p>}
    </div>
  )
}

// Badge Component
function Badge({ type, label }: any) {
  const styles: any = {
    admin: 'bg-violet-500/20 text-violet-300 border border-violet-500/30',
    moderator: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    active: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    inactive: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${styles[type] || styles.moderator}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {label}
    </span>
  )
}

export default function UsersPanel() {
  const [items, setItems] = useState<Admin[]>([])
  const [currentUser, setCurrentUser] = useState<Admin | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Create new user modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTgId, setNewTgId] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newRole, setNewRole] = useState('moderator')
  const [newActive, setNewActive] = useState(true)
  const [newTempPassword, setNewTempPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Edit user modal
  const [editingUser, setEditingUser] = useState<Admin | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editTgId, setEditTgId] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editOAuthEnabled, setEditOAuthEnabled] = useState(false)
  const [editPassword, setEditPassword] = useState('')
  const [editing, setEditing] = useState(false)

  // Confirm delete modal
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [deleteUserName, setDeleteUserName] = useState('')

  // Alert modal
  const [alertMessage, setAlertMessage] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const admins = await api.listAdmins()
      setItems(admins)
      
      // Get current user to know who "I" am
      const me = await api.me()
      const currentAdmin = admins.find(a => a.telegram_user_id === me.telegram_user_id)
      if (currentAdmin) setCurrentUser(currentAdmin)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreateUser = async () => {
    if (!newTgId || !newUsername) return
    if (!newTempPassword) {
      setAlertMessage('Пожалуйста, сгенерируйте пароль для пользователя')
      return
    }
    try {
      setCreating(true)
      await api.createAdmin({
        telegram_user_id: parseInt(newTgId),
        username: newUsername,
        role: newRole as any,
        is_active: newActive,
        temp_password: newTempPassword,
      })
      setNewTgId('')
      setNewUsername('')
      setNewRole('moderator')
      setNewActive(true)
      setNewTempPassword('')
      setShowCreateModal(false)
      await load()
    } finally {
      setCreating(false)
    }
  }

  const openEditModal = (user: Admin) => {
    setEditingUser(user)
    setEditUsername(user.username)
    setEditTgId(user.telegram_user_id.toString())
    setEditRole(user.role)
    setEditActive(user.is_active)
    setEditOAuthEnabled(user.telegram_oauth_enabled || false)
    setEditPassword('')
  }

  const handleUpdateUser = async () => {
    if (!editingUser) return
    try {
      setEditing(true)
      await api.updateAdmin(editingUser.id, {
        username: editUsername,
        telegram_user_id: parseInt(editTgId),
        role: editRole as any,
        is_active: editActive,
        telegram_oauth_enabled: editOAuthEnabled,
        temp_password: editPassword || undefined,
      })
      setEditingUser(null)
      await load()
    } finally {
      setEditing(false)
    }
  }

  const confirmDeleteUser = (user: Admin) => {
    setDeleteUserId(user.id)
    setDeleteUserName(user.username)
  }

  const handleDeleteUser = async () => {
    if (!deleteUserId) return
    await api.deleteAdmin(deleteUserId)
    setDeleteUserId(null)
    setDeleteUserName('')
    await load()
  }

  const filtered = items.filter(
    (item) =>
      item.username.toLowerCase().includes(search.toLowerCase()) ||
      item.telegram_user_id.toString().includes(search) ||
      item.role.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin px-4 sm:px-6 py-6">
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Пользователи</h1>
          <p className="text-sm text-white/50 mt-1">Управление администраторами и модераторами</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-medium hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30"
        >
          {Icons.plus}
          Добавить
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Поиск по имени, ID или роли..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all"
        />
      </div>

      {/* Users Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-white/50">Загрузка...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-white/40">Пользователей не найдено</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((user) => {
            const isCurrentUser = currentUser?.id === user.id
            return (
              <div
                key={user.id}
                className="group relative bg-gradient-to-br from-white/5 via-white/[0.02] to-transparent border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all duration-300 hover:shadow-lg hover:shadow-white/5"
              >
                {/* Current user badge */}
                {isCurrentUser && (
                  <div className="absolute top-3 right-3 bg-emerald-500/20 border border-emerald-500/30 rounded-full px-2.5 py-1 text-xs font-medium text-emerald-300">
                    Вы
                  </div>
                )}

                {/* User Info */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-white/10 flex items-center justify-center text-violet-300">
                    {Icons.user}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{user.username}</h3>
                    <p className="text-xs text-white/50 mt-0.5">ID: {user.telegram_user_id}</p>
                  </div>
                </div>

                {/* Status badges */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge type={user.role === 'administrator' ? 'admin' : 'moderator'} label={user.role === 'administrator' ? 'Администратор' : 'Модератор'} />
                  <Badge type={user.is_active ? 'active' : 'inactive'} label={user.is_active ? 'Активен' : 'Отключен'} />
                </div>

                {/* OAuth status */}
                {user.telegram_oauth_enabled && (
                  <div className="mb-4 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-300 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                    Telegram OAuth включен
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditModal(user)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm font-medium"
                  >
                    {Icons.edit}
                    Редактировать
                  </button>
                  <button
                    onClick={() => confirmDeleteUser(user)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium"
                  >
                    {Icons.trash}
                    Удалить
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create User Modal */}
      <Modal isOpen={showCreateModal} title="Добавить пользователя" onClose={() => setShowCreateModal(false)}>
        <Input label="Telegram ID" value={newTgId} onChange={setNewTgId} placeholder="431503783" hint="Уникальный ID из Telegram" />
        <Input label="Логин" value={newUsername} onChange={setNewUsername} placeholder="username" hint="Для входа в панель" />
        <Select
          label="Роль"
          value={newRole}
          onChange={setNewRole}
          options={[
            { value: 'moderator', label: 'Модератор' },
            { value: 'administrator', label: 'Администратор' },
          ]}
        />
        
        {/* Password Field with Generate & Copy */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-white/70">Пароль</label>
            <button
              onClick={() => {
                const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
                let password = ''
                for (let i = 0; i < 12; i++) {
                  password += chars.charAt(Math.floor(Math.random() * chars.length))
                }
                setNewTempPassword(password)
              }}
              type="button"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-500/20 border border-violet-500/30 text-violet-300 hover:bg-violet-500/30 transition-all text-xs font-medium"
            >
              {Icons.refresh}
              <span>Сгенерировать</span>
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              value={newTempPassword}
              onChange={(e) => setNewTempPassword(e.target.value)}
              placeholder="Введите или сгенерируйте"
              className="w-full px-3 py-2 pr-10 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-all font-mono"
            />
            {newTempPassword && (
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newTempPassword)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-all"
                title="Скопировать"
              >
                {copied ? Icons.check : Icons.copy}
              </button>
            )}
          </div>
          {newTempPassword && (
            <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-xs text-emerald-300 mb-1">Отправьте эти данные модератору:</p>
              <div className="flex items-center justify-between gap-2 mt-2">
                <code className="text-xs text-white bg-black/30 px-2 py-1.5 rounded font-mono flex-1 overflow-x-auto">
                  {newUsername || '...'} / {newTempPassword}
                </code>
                <button
                  onClick={() => {
                    const text = `Логин: ${newUsername}\nПароль: ${newTempPassword}`
                    navigator.clipboard.writeText(text)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-all"
                  title="Скопировать всё"
                >
                  {copied ? Icons.check : Icons.copy}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <Toggle label="Активен при создании" checked={newActive} onChange={setNewActive} />
        <div className="flex gap-2 pt-4">
          <button
            onClick={() => setShowCreateModal(false)}
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 transition-all font-medium"
          >
            Отмена
          </button>
          <button
            onClick={handleCreateUser}
            disabled={creating || !newTgId || !newUsername}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
          >
            {Icons.check}
            Создать
          </button>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        title={`Редактировать ${editingUser?.username}`}
        onClose={() => setEditingUser(null)}
      >
        <Input label="Логин" value={editUsername} onChange={setEditUsername} disabled={editing} />
        <Input
          label="Telegram ID"
          value={editTgId}
          onChange={setEditTgId}
          disabled={editing}
          hint={currentUser?.id === editingUser?.id ? 'Вы можете изменить свой ID здесь' : undefined}
        />
        <Select
          label="Роль"
          value={editRole}
          onChange={setEditRole}
          disabled={editing}
          options={[
            { value: 'moderator', label: 'Модератор' },
            { value: 'administrator', label: 'Администратор' },
          ]}
        />
        <Toggle label="Активен" checked={editActive} onChange={setEditActive} disabled={editing} />
        <Toggle
          label="Telegram OAuth"
          checked={editOAuthEnabled}
          onChange={setEditOAuthEnabled}
          disabled={editing}
          hint="Позволить вход через Telegram"
        />
        <Input
          label="Новый пароль (опционально)"
          value={editPassword}
          onChange={setEditPassword}
          disabled={editing}
          type="password"
          placeholder="Оставьте пусто чтобы не менять"
        />
        <div className="flex gap-2 pt-4">
          <button
            onClick={() => setEditingUser(null)}
            disabled={editing}
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 disabled:opacity-50 transition-all font-medium"
          >
            Отмена
          </button>
          <button
            onClick={handleUpdateUser}
            disabled={editing}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
          >
            {Icons.check}
            Сохранить
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteUserId}
        title="Удалить пользователя?"
        message={`Вы собираетесь удалить пользователя "${deleteUserName}". Это действие нельзя отменить.`}
        confirmText="Удалить"
        cancelText="Отмена"
        danger
        onConfirm={handleDeleteUser}
        onCancel={() => { setDeleteUserId(null); setDeleteUserName(''); }}
      />

      {/* Alert Modal */}
      <AlertModal
        isOpen={!!alertMessage}
        title="Внимание"
        message={alertMessage}
        onClose={() => setAlertMessage('')}
      />
    </div>
    </div>
  )
}
