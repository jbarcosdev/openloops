import { secretManager } from './secret-manager'

export const DEFAULT_DATABASE_NAME = 'openloops'

export const getDatabaseName = (): string => secretManager.get('OPENLOOPS_DB_NAME') || DEFAULT_DATABASE_NAME
