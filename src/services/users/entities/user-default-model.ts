import { sanitizeString } from '@common/helpers'

export interface DefaultModelProps {
	provider?: string
	model?: string
}

export class DefaultModel {
	constructor (public provider?: string, public model?: string) {}

	static fromJSON (props: DefaultModelProps): DefaultModel {
		return new DefaultModel(sanitizeString(props.provider), sanitizeString(props.model))
	}

	toJSON (): DefaultModelProps {
		return { provider: this.provider, model: this.model }
	}
}
