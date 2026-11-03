import { HttpError } from '@common/error'

export interface ScopeUser {
    userId?: string
    isAdmin (): boolean
}

type ScopeKind = 'view' | 'edit' | 'manage' | 'admin' | 'system'

export class Scope {
    private constructor (
        readonly kind: ScopeKind,
        readonly userId?: string,
        readonly reason?: string,
    ) {}

    get trusted (): boolean {
        return this.kind === 'admin' || this.kind === 'system'
    }

    static canView (user?: ScopeUser): Scope {
        return new Scope('view', Scope.requireUserId(user))
    }

    static canEdit (user?: ScopeUser): Scope {
        return new Scope('edit', Scope.requireUserId(user))
    }

    static canManage (user?: ScopeUser): Scope {
        return new Scope('manage', Scope.requireUserId(user))
    }

    static asAdmin (user?: ScopeUser): Scope {
        const userId = Scope.requireUserId(user)
        if (!user?.isAdmin()) throw new HttpError({ statusCode: 403, errorMessage: '{{forbidden_error}}: {{forbidden_error_details}}' })
        return new Scope('admin', userId)
    }

    static system (reason: string): Scope {
        if (!reason?.trim()) throw new Error('[Scope] A reason is required for a system scope')
        return new Scope('system', undefined, reason)
    }

    private static requireUserId (user?: ScopeUser): string {
        if (!user?.userId) throw new HttpError({ statusCode: 401, errorMessage: '{{not_authorized}}' })
        return user.userId
    }
}
