import { ObjectId } from 'mongodb'
import { getTimezone } from 'iso-data'
import { getMongoDBClient } from '@common/repositories/mongo-db.client'
import { secretManager } from '@common/utils/secret-manager'
import { logger } from '@common/logger'
import { User, UserProps, UserRole } from '@services/users/entities/user.entity'

export class CurrentUser extends User {
    private _isPremium = false

    static async asyncFromDB(userId: string): Promise<CurrentUser | undefined> {
        if (!userId) return undefined

        const mongoDBClient = getMongoDBClient()
        const db = await mongoDBClient.db(secretManager.get('OPENLOOPS_DB_NAME'))

        let user: UserProps | null

        try {
            user = await db.collection('users').findOne(
                { _id: new ObjectId(userId) },
                { projection: { password: 0 } }
            )
        } catch (error: any) {
            logger.error({ userId, error }, '[Current User] Error fetching user with ID')
            throw error
        }

        if (!user) {
            logger.warn({ userId }, '[Current User] User not found in database')
            return undefined
        }

        return CurrentUser.fromJSON(user) as CurrentUser
    }

    static fromJSON(json: UserProps): CurrentUser {
        const user = User.fromJSON(json)
        return Object.assign(new CurrentUser(user.props), user)
    }

    get userId (): string | undefined {
        return this._id?.toString()
    }
    
    get language (): string | undefined {
        return this.preferences?.language?.isoCode
    }

    get hasPushNotificationsPermission (): boolean {
        return this.permissions?.notifications ?? false
    }

    get timezoneOffset () {
        return getTimezone(this.preferences?.timezone?.ianaIdentifier)?.offset ?? 0
    }

    public setIsPremium (value: boolean) {
        this._isPremium = value
    }

    public isAdmin (): boolean {
        return this.role === UserRole.ADMIN
    }

    public isFreePlan (): boolean {
        return !this.isPremium
    }

    public isPremium (): boolean {
        return this._isPremium
    }
}

export interface CurrentUserProps extends UserProps {}
