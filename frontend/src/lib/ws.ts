export type WSMessage = {
  event: string
  data: any
}

export function createWebSocket(onMessage: (data: WSMessage) => void) {
  let ws: WebSocket | null = null
  let retry = 0
  let closedManually = false
  let reconnectTimer: number | null = null

  const cleanupTimer = () => {
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const connect = () => {
    cleanupTimer()
    if (closedManually) return
    ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`)
    ws.onopen = () => {
      retry = 0
    }
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data))
      } catch {
        // ignore
      }
    }
    ws.onclose = () => {
      if (closedManually) return
      retry += 1
      const base = Math.min(500 * Math.pow(2, retry), 10000)
      const jitter = Math.floor(Math.random() * 400)
      reconnectTimer = window.setTimeout(connect, base + jitter)
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && (!ws || ws.readyState > WebSocket.OPEN)) {
      connect()
    }
  }
  const onOnline = () => {
    if (!ws || ws.readyState > WebSocket.OPEN) {
      connect()
    }
  }

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  connect()
  return () => {
    closedManually = true
    cleanupTimer()
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    ws?.close()
  }
}
