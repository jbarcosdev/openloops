import { BaseEntity } from '@common/base/base.entity'

export interface DefaultModelProps {
	provider?: string
	model?: string
}

export class DefaultModel {
	constructor (public provider?: string, public model?: string) {}

	static fromJSON (props: DefaultModelProps): DefaultModel {
		return new DefaultModel(BaseEntity.toText(props.provider), BaseEntity.toText(props.model))
	}

	toJSON (): DefaultModelProps {
		return { provider: this.provider, model: this.model }
	}
}
