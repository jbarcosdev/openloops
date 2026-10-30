const WORDS = [
    'Thinking',
    'Computing',
    'Pondering',
    'Analyzing',
    'Crunching',
    'Reviewing',
    'Checking',
    'Working on it',
    'Reasoning',
    'Digging in',
    'Gathering',
    'Sorting',
    'Calculating',
    'Connecting the dots',
    'Exploring',
    'Piecing it together',
    'Figuring it out',
    'Untangling',
    'Weighing options',
    'Cooking',
]

const WINDOW_IN_MS = 4000

function hash (text: string): number {
    let value = 5381

    for (const character of text) value = ((value << 5) + value + character.charCodeAt(0)) >>> 0

    return value
}

/**
 * @deprecated Since 0.3.0, and it will be removed in 0.4.0 together with `state.currentActivity`.
 * It only serves the app versions that still poll the chat and read `state.currentActivity` from it: the real activity is not
 * saved anymore, so while a run is processing the read adds a generic word, one per chat that changes every few seconds.
 * Follow a run with `agent.onActivity` instead.
 */
export function deprecatedActivity (chatId: string, now: number = Date.now()): string {
    const window = Math.floor(now / WINDOW_IN_MS)
    const index = hash(`${chatId}:${window}`) % WORDS.length

    return `${WORDS[index]}...`
}
