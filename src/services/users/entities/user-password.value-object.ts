import bcrypt from 'bcryptjs'

export class UserPassword {
    private static readonly SALT_ROUNDS = 10

    private constructor() {}

    /**
     * Validates that the password meets the required security format:
     * - Minimum 8 characters
     * - At least one lowercase letter
     * - At least one uppercase letter
     * - At least one number
     * - At least one special character from the allowed set: @ $ ! % * ? & .
     * - Only letters, numbers, and the special characters above are allowed
     *
     * @param password Plain-text password to validate
     * @returns `true` if the password is valid, `false` otherwise
     */
    public static validateFormat(password: string): boolean {
        const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/
        return re.test(password)
    }

    public static async create(password: string | undefined): Promise<string | undefined> {
        if (!password) return undefined

        // if (!this.validateFormat(password)) throw new Error('{{invalid_password_format}}')

        return bcrypt.hash(password.trim(), this.SALT_ROUNDS)
    }

    public static async compare(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash)
    }

    public static isHashed(password: string): boolean {
        return password.length === 60 && password.startsWith('$2')
    }
}
