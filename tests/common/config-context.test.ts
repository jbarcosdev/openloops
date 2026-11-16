import { runWithConfigs } from '@common/utils/config-context'

const { SecretManager, secretManager } = jest.requireActual('@common/utils/secret-manager') as typeof import('@common/utils/secret-manager')

describe('config context', () => {
    beforeAll(() => {
        process.env.SECRET_MANAGER_KEY = 'legacy-master-key'
        process.env.SECRET_MANAGER_KEY_V1 = 'v1-master-key'
    })

    it('keeps the configs of two tenants apart in the same process', async () => {
        const read = (name: string) => async () => {
            await new Promise(resolve => setTimeout(resolve, 5))
            return secretManager.get('OPENLOOPS_DB_NAME') + ':' + name
        }

        const [a, b] = await Promise.all([
            runWithConfigs({ OPENLOOPS_DB_NAME: 'agent_a' }, read('a')),
            runWithConfigs({ OPENLOOPS_DB_NAME: 'agent_b' }, read('b')),
        ])

        expect(a).toBe('agent_a:a')
        expect(b).toBe('agent_b:b')
    })

    it('falls back to the environment outside of a context', () => {
        process.env.SOME_KEY = 'from-env'

        expect(secretManager.get('SOME_KEY')).toBe('from-env')
        expect(runWithConfigs({}, () => secretManager.get('SOME_KEY'))).toBe('')
    })

    it('decrypts versioned and legacy values inside a context', () => {
        const legacy = SecretManager.encrypt('legacy-secret')
        const versioned = SecretManager.encrypt('versioned-secret', 1)

        expect(versioned.startsWith('ENC:v1:')).toBe(true)
        expect(runWithConfigs({ A: legacy, B: versioned }, () => [secretManager.get('A'), secretManager.get('B')])).toEqual(['legacy-secret', 'versioned-secret'])
    })
})
