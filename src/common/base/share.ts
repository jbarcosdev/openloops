import { ObjectId } from 'bson'

export const SHARE_PERMISSIONS = ['read', 'write', 'manage'] as const

export type SharePermission = typeof SHARE_PERMISSIONS[number]

export interface ShareProps {
    userId: string | ObjectId
    permission: SharePermission
}

export interface Share {
    userId: ObjectId
    permission: SharePermission
}

export const createShares = (props?: ShareProps[]): Share[] | undefined => {
    if (!props?.length) return undefined

    const byUser = new Map<string, Share>()
    for (const { userId, permission } of props) {
        if (!SHARE_PERMISSIONS.includes(permission)) throw new Error(`Share: Invalid permission: ${permission}`)
        if (!userId) throw new Error('Share: userId is required')
        const id = userId instanceof ObjectId ? userId : new ObjectId(userId)

        const current = byUser.get(id.toString())
        if (!current || SHARE_PERMISSIONS.indexOf(permission) > SHARE_PERMISSIONS.indexOf(current.permission)) {
            byUser.set(id.toString(), { userId: id, permission })
        }
    }

    return [...byUser.values()]
}
