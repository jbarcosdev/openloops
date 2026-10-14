import { isKnownModel, toModelRef } from '@clients/model-resolution'
import { UserProps } from '../entities'

export interface DefaultModelChange {
	preferences: UserProps['preferences']
	clear: boolean
}

export async function readDefaultModel (preferences: UserProps['preferences']): Promise<DefaultModelChange> {
	const requested = (preferences as Record<string, unknown> | undefined)?.defaultModel

	if (requested === undefined) return { preferences, clear: false }

	const { defaultModel, ...rest } = preferences as Record<string, unknown>

	if (requested === null) return { preferences: rest as UserProps['preferences'], clear: true }

	const ref = toModelRef(requested as Record<string, unknown>)
	if (!ref) throw new Error('The default model needs a provider and a model, or null to remove it')

	if (!await isKnownModel(ref.provider, ref.model)) throw new Error(`The model "${ref.provider}/${ref.model}" does not exist`)

	return { preferences: { ...rest, defaultModel: { provider: ref.provider, model: ref.model } } as UserProps['preferences'], clear: false }
}
