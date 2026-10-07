export type RawData = Buffer | ArrayBuffer | Buffer[] | string

/** The socket operations the session pipeline uses. */
export interface WebSocket {
  readyState: number
  bufferedAmount: number
  send(data: string, callback?: (error?: Error) => void): void
  close(code?: number, reason?: string): void
  terminate(): void
  ping(): void
  on(event: "message", listener: (data: RawData, isBinary: boolean) => void): void
  on(event: "pong", listener: () => void): void
  on(event: "error", listener: (error: NodeJS.ErrnoException) => void): void
  on(event: "close", listener: () => void): void
}
