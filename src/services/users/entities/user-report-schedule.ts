export interface ReportScheduleProps {
	enabled?: boolean
	time?: number
}

export class ReportSchedule {
	constructor (
		public enabled?: boolean,
		public time?: number,
	) {}

	static fromJSON (props: ReportScheduleProps): ReportSchedule {
		return new ReportSchedule(props.enabled, props.time)
	}

	toJSON (): ReportScheduleProps {
		return { enabled: this.enabled, time: this.time }
	}
}
