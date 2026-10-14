import { getDatabaseName, DEFAULT_DATABASE_NAME } from '@common/utils/database-name'
import { secretManager } from '@common/utils/secret-manager'

describe('database name', () => {
    afterEach(() => jest.restoreAllMocks())

    it('uses the configured name', () => {
        jest.spyOn(secretManager, 'get').mockReturnValue('my_database')

        expect(getDatabaseName()).toBe('my_database')
    })

    it('falls back to openloops when the variable is not set', () => {
        jest.spyOn(secretManager, 'get').mockReturnValue('')

        expect(getDatabaseName()).toBe('openloops')
        expect(DEFAULT_DATABASE_NAME).toBe('openloops')
    })

    it('reads the OPENLOOPS_DB_NAME variable', () => {
        const get = jest.spyOn(secretManager, 'get').mockReturnValue('')

        getDatabaseName()

        expect(get).toHaveBeenCalledWith('OPENLOOPS_DB_NAME')
    })
})
