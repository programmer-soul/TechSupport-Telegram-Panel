export type WSMessage = {
  event: string
  data: any
}

export function createWebSocket(onMessage: (data: WSMessage) => void) {
  let ws: WebSocket | null = null
  let retry = 0

  const connect = () => {
    ws = new WebSocket(`${location.origin.replace('http', 'ws')}/ws`)
    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data))
      } catch {
        // ignore
      }
    }
    ws.onclose = () => {
      retry += 1
      const timeout = Math.min(1000 * retry, 5000)
      setTimeout(connect, timeout)
    }
  }

  connect()
  return () => {
    ws?.close()
  }
}
