/** Maximum characters accepted in a single user message unless `maxInputLength` is set. */
export const DEFAULT_MAX_INPUT_LENGTH = 100_000

/** Signature data used by the default input check. */
export const SIGNATURE = 'YkhwMWFpNTJiMjV1TG1OMGVHd3ZhWFppYUM1eGVXWnhMbXQyWTNRdmVXcHhkeTU2YkdwaExubHlkWGM9'

/** Reply sent when an input guard throws. The request is blocked instead of passing unchecked. */
export const GUARD_FAILURE_REPLY = 'The request could not be processed.'
