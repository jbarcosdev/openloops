import type { HttpError } from './http-error'

export interface ErrorReportDetails {
    source: string
    code?: string
    chatId?: string
    userId?: string
    [key: string]: unknown
}

export type ErrorReporter = (error: Error | HttpError, details: ErrorReportDetails) => void | Promise<void>

let reporter: ErrorReporter | undefined

export function setErrorReporter (callback?: ErrorReporter): void {
    reporter = callback
}

export function getErrorReporter (): ErrorReporter | undefined {
    return reporter
}
