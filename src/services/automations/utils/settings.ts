import { numberSetting } from '@common/utils/number-setting'

const DEFAULT_LEASE_MS = 10 * 60 * 1000
const DEFAULT_POLL_INTERVAL_MS = 60 * 1000
const DEFAULT_MAX_QUEUED_RUNS = 10

export const leaseMs = (): number => numberSetting('AUTOMATIONS_LEASE_MS', DEFAULT_LEASE_MS)

export const pollIntervalMs = (): number => numberSetting('AUTOMATIONS_POLL_INTERVAL_MS', DEFAULT_POLL_INTERVAL_MS)

export const maxQueuedRuns = (): number => numberSetting('AUTOMATIONS_MAX_QUEUED_RUNS', DEFAULT_MAX_QUEUED_RUNS)
