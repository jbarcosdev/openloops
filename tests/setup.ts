
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

jest.mock('@common/repositories', () => ({
    MongoRepository: class {},
    Scope: jest.requireActual('@common/repositories/scope').Scope,
}))

jest.mock('@services/llmcalls', () => ({
    createLLMCall: jest.fn(async () => ({})),
}))

jest.mock('@services/mcp-servers', () => ({
    listAllMcpServersByUser: (params: unknown) => require('./support/fake-mcp').fakeMcp.list(params),
    verifyMcpServerConnection: (params: any) => require('./support/fake-mcp').fakeMcp.verify(params),
    decideMcpServerTrust: (params: any) => require('./support/fake-mcp').fakeMcp.decide(params),
}))

jest.mock('@services/mcp-servers/internal', () => ({
    listActiveInternalMcps: () => require('./support/fake-mcp').fakeMcp.listInternals(),
}))

jest.mock('@services/mcp-servers/entities', () => ({
    ...jest.requireActual('@services/mcp-servers/entities'),
    McpServer: require('./support/fake-mcp').FakeMcpServer,
}))
