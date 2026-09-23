import sanitizeHtml from 'sanitize-html'

export function sanitizeString (input = ''): string | undefined {
	if (!input) return undefined

	return sanitizeHtml(input, {
		allowedTags: [],
		allowedAttributes: {}
	})
}
