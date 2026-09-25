import { ReportSchedule, ReportScheduleProps } from './user-report-schedule'

export interface ReportPreferencesProps {
	dailySummary?: ReportScheduleProps
	weeklySummary?: ReportScheduleProps
	monthlySummary?: ReportScheduleProps
	dailyReminder?: ReportScheduleProps
}

export class ReportPreferences {
	constructor (
		public dailySummary?: ReportSchedule,
		public weeklySummary?: ReportSchedule,
		public monthlySummary?: ReportSchedule,
		public dailyReminder?: ReportSchedule,
	) {}

	static fromJSON (props: ReportPreferencesProps): ReportPreferences {
		return new ReportPreferences(
			props.dailySummary && ReportSchedule.fromJSON(props.dailySummary),
			props.weeklySummary && ReportSchedule.fromJSON(props.weeklySummary),
			props.monthlySummary && ReportSchedule.fromJSON(props.monthlySummary),
			props.dailyReminder && ReportSchedule.fromJSON(props.dailyReminder),
		)
	}

	toJSON (): ReportPreferencesProps {
		return {
			dailySummary: this.dailySummary?.toJSON(),
			weeklySummary: this.weeklySummary?.toJSON(),
			monthlySummary: this.monthlySummary?.toJSON(),
			dailyReminder: this.dailyReminder?.toJSON(),
		}
	}
}
