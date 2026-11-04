import { CurrentUser } from '@common/base/current-user'

describe('CurrentUser', () => {
    it('is on the free plan until it is premium', () => {
        const user = new CurrentUser({} as any)

        expect(user.isFreePlan()).toBe(true)

        user.setIsPremium(true)

        expect(user.isFreePlan()).toBe(false)
    })
})
