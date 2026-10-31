const MARKERS: Record<string, RegExp> = {
    en: /\b(the|your|my|for|of|and|to|with|searching|checking|looking|finding|comparing|reviewing|calculating|recording)\b/gi,
    es: /\b(el|los|las|tu|tus|del|y|con|revisando|consultando|comparando|calculando|registrando|voy|buscar)\b/gi,
    pt: /\b(os|as|seu|sua|seus|suas|do|da|dos|das|com|procurando|verificando|consultando|comparando|calculando|registrando|vou|procurar)\b/gi,
    fr: /\b(le|les|des|du|votre|vos|pour|et|avec|je|vais|recherche|v[eé]rifie|consulte|compare|calcule|enregistre)\b/gi,
}

const scoreOf = (language: string, text: string) => (text.match(MARKERS[language]) ?? []).length

export function activityVerdict (language: string, activities: string[] = []) {
    if (!activities.length) return { ok: false, reason: 'no activity written' }

    for (const activity of activities) {
        if (activity.length > 60) return { ok: false, reason: `activity too long (${activity.length}): ${activity}` }
        if (/[_{}]|search_items|get_item|reserve_item|\brespond\b/i.test(activity)) return { ok: false, reason: `activity mentions ids or tools: ${activity}` }
        const own = scoreOf(language, activity)
        const rival = Object.keys(MARKERS).find(other => other !== language && scoreOf(other, activity) > own)
        if (rival) return { ok: false, reason: `activity looks ${rival} instead of ${language}: ${activity}` }
    }

    return { ok: true }
}
