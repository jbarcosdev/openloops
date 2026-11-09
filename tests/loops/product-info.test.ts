import { AgiLoop } from '@loops/index'
import { Agent } from '@harness/agent'

import { useHarness } from '../support'

describe('Agent identity and product info', () => {
    const env = useHarness()

    it('gives the fast responder the identity and the product info', async () => {
        env.fast.canAnswer = true

        const agent = new Agent({
            loop: new AgiLoop(),
            identity: { name: 'Ava', role: 'AI assistant' },
            productInfo: { name: 'Acme', company: 'Acme Inc.', about: 'Money app.' }
        })

        await env.send(agent, 'hola')

        expect(env.fast.contexts[0]).toMatchObject({
            agentIdentity: { name: 'Ava', role: 'AI assistant' },
            productInfo: { name: 'Acme', company: 'Acme Inc.', about: 'Money app.' }
        })
    })

    it('leaves them out when the agent has none', async () => {
        env.fast.canAnswer = true

        await env.send(env.agent(), 'hola')

        expect(env.fast.contexts[0]).not.toHaveProperty('productInfo')
        expect(env.fast.contexts[0]).not.toHaveProperty('agentIdentity')
    })
})
