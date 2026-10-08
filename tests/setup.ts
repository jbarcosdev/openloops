import 'reflect-metadata'

jest.mock('langfuse', () => ({ Langfuse: class {} }))

jest.mock('@common/utils/secret-manager', () => ({
    secretManager: { get: (): string => '' },
}))

jest.mock('@common/logger', () => {
    class Logger {
        debug (): void {}
        info (): void {}
        warn (): void {}
        error (): void {}
        fatal (): void {}
        trace (): void {}
        child (): Logger { return this }
    }

    return { __esModule: true, Logger, logger: new Logger(), default: new Logger() }
})

jest.mock('sanitize-html', () => ({
    __esModule: true,
    default: (input: string): string => input,
}))

jest.mock('@common/repositories', () => ({
    MongoRepository: class {},
}))

jest.mock('@services/llmcalls', () => ({
    createLLMCall: jest.fn(async () => ({})),
}))

jest.mock('@services/mcp-servers', () => ({
    listMcpServersByUser: (params: unknown) => require('./support/fake-mcp').fakeMcp.list(params),
}))

jest.mock('@services/mcp-servers/entities', () => ({
    McpServer: require('./support/fake-mcp').FakeMcpServer,
}))
