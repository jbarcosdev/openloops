/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    moduleNameMapper: {
        '^@root/(.*)$': '<rootDir>/$1',
        '^@clients/(.*)$': '<rootDir>/src/clients/$1',
        '^@common/(.*)$': '<rootDir>/src/common/$1',
        '^@harness/(.*)$': '<rootDir>/src/harness/$1',
        '^@loops/(.*)$': '<rootDir>/src/loops/$1',
        '^@services/(.*)$': '<rootDir>/src/services/$1',
        '^@skills/(.*)$': '<rootDir>/src/skills/$1',
        '^@tools/(.*)$': '<rootDir>/src/tools/$1',
    },
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json', diagnostics: { ignoreCodes: [151002] } }],
    },
    collectCoverageFrom: ['src/harness/**/*.ts', 'src/loops/**/*.ts', 'src/clients/**/*.ts', 'src/services/tasks/entities/**/*.ts', 'src/tools/**/*.ts'],
    clearMocks: true,
}
