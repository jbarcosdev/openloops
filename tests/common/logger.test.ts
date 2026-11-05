describe('Logger', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
        process.env = { ...originalEnv }
        jest.resetModules()
        jest.dontMock('pino-pretty')
    })

    function load (env: Record<string, string | undefined>, prettyModule: () => unknown) {
        process.env.IS_LOCAL = env.IS_LOCAL
        process.env.NODE_ENV = env.NODE_ENV
        const factory = jest.fn(prettyModule)
        let Logger: any

        jest.isolateModules(() => {
            jest.doMock('pino-pretty', () => factory)
            Logger = require('@common/logger/pino').Logger
        })

        return { Logger, factory }
    }

    it('loads pino-pretty only once, and only when it runs locally', () => {
        const { Logger, factory } = load({ IS_LOCAL: 'true' }, () => process.stdout)

        expect(factory).toHaveBeenCalledTimes(1)
        new Logger()
        new Logger()
        expect(factory).toHaveBeenCalledTimes(1)
        expect(factory).toHaveBeenCalledWith({ colorize: true })
    })

    it('loads it in development too', () => {
        const { factory } = load({ NODE_ENV: 'development' }, () => process.stdout)

        expect(factory).toHaveBeenCalledTimes(1)
    })

    it('never loads it outside development', () => {
        const { Logger, factory } = load({ NODE_ENV: 'production' }, () => process.stdout)

        new Logger()
        expect(factory).not.toHaveBeenCalled()
    })

    it('keeps working without pino-pretty installed', () => {
        expect(() => load({ IS_LOCAL: 'true' }, () => { throw new Error('Cannot find module') })).not.toThrow()
    })
})
