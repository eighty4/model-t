import { load as parseYaml } from 'js-yaml'

export function convertMapOfStringLikes(
    c: Record<string, boolean | number | string>,
): Record<string, string> {
    const m: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) {
        m[k] = convertStringLike(v)
    }
    return m
}

export function convertStringLike(c: boolean | number | string): string {
    return isString(c) ? c : `${c}`
}

export function isArrayOfMaps(v: unknown): v is Array<Record<string, unknown>> {
    return Array.isArray(v) && v.every(isMap)
}

export function isArrayOfStringLikes(
    v: unknown,
): v is Array<boolean | number | string> {
    return Array.isArray(v) && v.every(isStringLike)
}

export function isArrayOfStrings(v: unknown): v is Array<string> {
    return Array.isArray(v) && v.every(isString)
}

export function isBoolean(v: unknown): v is boolean {
    return typeof v === 'boolean'
}

export function isMap(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function isMapOfStringLikes(
    v: unknown,
): v is Record<string, boolean | number | string> {
    return isMap(v) && Object.values(v).every(isStringLike)
}

export function isNumber(v: unknown): v is number {
    return typeof v === 'number'
}

export function isString(v: unknown): v is string {
    return typeof v === 'string'
}

export function isStringLike(v: unknown): v is string | number | boolean {
    return isString(v) || isBoolean(v) || isNumber(v)
}

export function readYaml(s: string): Record<string, unknown> {
    if (typeof s !== 'string' || !s.length) {
        throw new TypeError('YAML input must be a string')
    }
    const actionYaml: unknown = parseYaml(s)
    if (!isMap(actionYaml)) {
        throw new TypeError(
            `This ${typeof actionYaml} YAML is simply the opportunity to begin again, this time with a valid workflow YAML`,
        )
    }
    return actionYaml
}
