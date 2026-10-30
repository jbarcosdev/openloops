import { cleanActivity } from '@harness/utils/activity'

describe('cleanActivity', () => {
    it('keeps a short plain sentence as it is, with its accents', () => {
        expect(cleanActivity('Buscando tus gastos de vuelos de agosto')).toBe('Buscando tus gastos de vuelos de agosto')
        expect(cleanActivity('  Revisando   tu presupuesto 💰  ')).toBe('Revisando tu presupuesto 💰')
    })

    it('removes the markup and the line breaks', () => {
        expect(cleanActivity('**Buscando** `tus` gastos\n<b>de agosto</b>')).toBe('Buscando tus gastos b de agosto /b')
        expect(cleanActivity('Sumando {los} cargos\r\npara el total')).toBe('Sumando los cargos para el total')
    })

    it('cuts a long text at a whole word and marks it', () => {
        const text = 'Estoy revisando con mucho cuidado todos los gastos que hiciste en los viajes del año pasado para sumarlos'
        const cleaned = cleanActivity(text) as string

        expect(cleaned.length).toBeLessThanOrEqual(83)
        expect(cleaned.endsWith('...')).toBe(true)
        expect(text.startsWith(cleaned.slice(0, -3))).toBe(true)
        expect(text[cleaned.length - 3]).toBe(' ')
    })

    it('ignores what is not a usable text', () => {
        expect(cleanActivity(undefined)).toBeUndefined()
        expect(cleanActivity(null)).toBeUndefined()
        expect(cleanActivity(42)).toBeUndefined()
        expect(cleanActivity({ text: 'a' })).toBeUndefined()
        expect(cleanActivity('   ')).toBeUndefined()
        expect(cleanActivity('***')).toBeUndefined()
    })

    it('does not accept the values the app treats as states', () => {
        expect(cleanActivity('stopped')).toBeUndefined()
        expect(cleanActivity(' Running ')).toBeUndefined()
    })
})
