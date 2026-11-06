import { reportError, HttpError } from '@common/error'
import { setErrorReporter } from '@common/index'
import { sentryClient } from '@common/error/sentry-client'

jest.mock('@common/error/sentry-client', () => ({ sentryClient: { captureError: jest.fn(async () => undefined) } }))

const captureError = sentryClient.captureError as jest.Mock

describe('setErrorReporter', () => {
    afterEach(() => {
        setErrorReporter(undefined)
        captureError.mockClear()
    })

    it('hands the error and its details to the reporter, with a source', async () => {
        const reporter = jest.fn()
        setErrorReporter(reporter)
        const error = new Error('boom')

        await reportError(error, { source: 'mongo', collection: 'chats' })

        expect(reporter).toHaveBeenCalledWith(error, { source: 'mongo', collection: 'chats' })
    })

    it('uses the source openloops when the caller gives none, and turns a text into an Error', async () => {
        const reporter = jest.fn()
        setErrorReporter(reporter)

        await reportError('plain text')

        expect(reporter.mock.calls[0][0]).toBeInstanceOf(Error)
        expect(reporter.mock.calls[0][0].message).toBe('plain text')
        expect(reporter.mock.calls[0][1]).toEqual({ source: 'openloops' })
    })

    it('hands an HttpError as it is', async () => {
        const reporter = jest.fn()
        setErrorReporter(reporter)
        const error = new HttpError({ statusCode: 409, errorMessage: 'conflict' })

        await reportError(error)

        expect(reporter.mock.calls[0][0]).toBe(error)
    })

    it('waits for an async reporter', async () => {
        let finished = false
        setErrorReporter(async () => {
            await new Promise(resolve => setTimeout(resolve, 10))
            finished = true
        })

        await reportError(new Error('boom'))

        expect(finished).toBe(true)
    })

    it('ignores a reporter that throws, sync or async', async () => {
        setErrorReporter(() => { throw new Error('reporter down') })
        await expect(reportError(new Error('boom'))).resolves.toBeUndefined()

        setErrorReporter(async () => { throw new Error('reporter down') })
        await expect(reportError(new Error('boom'))).resolves.toBeUndefined()
    })

    it('turns the Sentry of SENTRY_DSN off while a reporter is set, and uses it again without one', async () => {
        setErrorReporter(jest.fn())
        await reportError(new Error('boom'))
        expect(captureError).not.toHaveBeenCalled()

        setErrorReporter(undefined)
        await reportError(new Error('boom'))
        expect(captureError).toHaveBeenCalledTimes(1)
    })
})
