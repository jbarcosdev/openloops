import { Agent } from 'openloops/core'
import { Logger, runWithConfigs, SecretManager } from 'openloops/common'
import { CurrentUser } from 'openloops/base'
import { AgiLoop } from 'openloops/loops'

/**
 * Serves two agents from the same process. Each one has its own database, its own JWT secret and its own model key, and the
 * values are stored encrypted. Everything inside `runWithConfigs` reads that configuration and never the environment.
 */
const agents: Record<string, Record<string, string>> = {
    acme: {
        OPENLOOPS_DB_URI: 'mongodb://localhost:27017',
        OPENLOOPS_DB_NAME: 'agent_acme',
        JWT_SECRET: SecretManager.encrypt('acme-jwt-secret', 1),
        ANTHROPIC_API_KEY: SecretManager.encrypt(process.env.ACME_ANTHROPIC_API_KEY as string, 1),
    },
    globex: {
        OPENLOOPS_DB_URI: 'mongodb://localhost:27017',
        OPENLOOPS_DB_NAME: 'agent_globex',
        JWT_SECRET: SecretManager.encrypt('globex-jwt-secret', 1),
        ANTHROPIC_API_KEY: SecretManager.encrypt(process.env.GLOBEX_ANTHROPIC_API_KEY as string, 1),
    },
}

async function handleRequest (agentName: string, userId: string, message: string) {
    return runWithConfigs(agents[agentName], async () => {
        const currentUser = await CurrentUser.asyncFromDB(userId)

        if (!currentUser) throw new Error('[Demo] current user is not defined')

        const agent = new Agent({ loop: new AgiLoop() })

        return agent.run({ input: { message }, currentUser })
    })
}

async function runMultiTenant () {
    const logger = new Logger()

    try {
        const [acme, globex] = await Promise.all([
            handleRequest('acme', '6ab56894eb20887d1ef7942c', 'hi from acme'),
            handleRequest('globex', '6ab56894eb20887d1ef7942d', 'hi from globex'),
        ])

        logger.info({ acme, globex }, '[Demo] Result')
    } catch (error: any) {
        logger.error(error, '[Demo] Error')
    }
}

runMultiTenant()
