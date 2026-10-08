import { Tool } from "@tools/tool"

export interface WeightedKeyword {
    keyword: string
    weight: number
}

export interface ScoredTool {
    toolName: string
    score: number
    matchedKeywords: string[]
    tool: Tool
}

/**
 * Escapa caracteres especiales de regex para evitar errores sintácticos.
 */
function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Calcula la coincidencia sintáctica entre las palabras clave ponderadas y una lista de herramientas.
 * 
 * Estrategia de Scoring:
 * 1. Ponderación por campo: Matches en 'name' reciben un multiplicador 2.5x vs 'description' (1.0x).
 * 2. Regex con límites de palabra (\b): Evita falsos positivos por subcadenas cortas.
 * 3. Reemplazo de '_': Permite hacer match exacto de palabras en nombres en 'snake_case'.
 * 4. Frecuencia saturada (Dampening): Usar la raíz cuadrada (Math.sqrt) de las ocurrencias previene
 *    que descripciones largas o repetitivas inflen el score artificialmente.
 * 5. Peso dinámico del intent: Se multiplica por el 'weight' asignado por el intentAnalyzer (0.1 a 1.0).
 */
export function rankToolsByKeywords(
    keywords: WeightedKeyword[],
    tools: Tool[],
    minScoreThreshold = 0.1
): ScoredTool[] {
    const NAME_WEIGHT_MULTIPLIER = 2.5
    const DESCRIPTION_WEIGHT_MULTIPLIER = 1.0

    const results: ScoredTool[] = []

    for (const tool of tools) {
        let totalScore = 0
        const matchedKeywordsSet = new Set<string>()

        // Formatear el nombre reemplazando snake_case para facilitar coincidencia de palabras
        const normalizedName = tool.name.replace(/_/g, ' ')
        const normalizedDescription = tool.description || ''

        for (const { keyword, weight } of keywords) {
            if (!keyword || weight <= 0) continue

            const cleanKeyword = keyword.trim()
            const escapedKeyword = escapeRegExp(cleanKeyword)

            // \b para garantizar coincidencia de término completo
            const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'gi')

            const nameMatches = (normalizedName.match(regex) || []).length
            const descMatches = (normalizedDescription.match(regex) || []).length

            if (nameMatches > 0 || descMatches > 0) {
                matchedKeywordsSet.add(cleanKeyword)

                // Frecuencia con amortiguación (saturación para evitar spam de palabras)
                const nameScore = Math.sqrt(nameMatches) * NAME_WEIGHT_MULTIPLIER
                const descScore = Math.sqrt(descMatches) * DESCRIPTION_WEIGHT_MULTIPLIER

                const keywordContribution = (nameScore + descScore) * weight
                totalScore += keywordContribution
            }
        }

        // Normalización opcional de score por longitud para dar un pequeño impulso a herramientas con nombre corto
        if (totalScore >= minScoreThreshold) {
            results.push({
                toolName: tool.name,
                score: Number(totalScore.toFixed(4)),
                matchedKeywords: Array.from(matchedKeywordsSet),
                tool,
            })
        }
    }

    return results.sort((a, b) => b.score - a.score)
}
