import type { GHAction, GHActionInput } from './model.ts'
import {
    convertStringLike,
    isBoolean,
    isMap,
    isStringLike,
    readYaml,
} from './readingFns.ts'

export type GHActionSchemaError = {
    message: string
    path: string
}

export function readActionModel(s: string): GHAction {
    const actionYaml = readYaml(s)
    const action: Partial<GHAction> = {}
    //action.name = expectString(actionYaml, 'name')
    //if ('author' in actionYaml) {
    //    action.author = parseString(actionYaml.author)
    //}
    //action.description = expectString(actionYaml, 'description')
    if ('inputs' in actionYaml) {
        action.inputs = collectInputs(actionYaml.inputs)
    }
    //if ('outputs' in actionYaml) {
    //    action.outputs = collectOutputs(actionYaml.outputs)
    //}
    return action as GHAction
}

function expectString(v: Record<string, unknown>, k: string): string {
    if (k in v) {
        return parseString(v[k])
    }
    throw new Error()
}

function parseString(v: unknown): string {
    if (isStringLike(v)) {
        return convertStringLike(v)
    }
    throw new Error()
}

function collectInputs(inputsYaml: unknown): Record<string, GHActionInput> {
    if (!isMap(inputsYaml)) {
        throw new Error()
    }
    const inputs: Record<string, GHActionInput> = {}
    for (const [inputId, inputYaml] of Object.entries(inputsYaml)) {
        inputs[inputId] = parseInput(inputYaml)
    }
    return inputs
}

function parseInput(inputYaml: unknown): GHActionInput {
    if (!isMap(inputYaml)) {
        throw new Error()
    }
    const input: Partial<GHActionInput> = {
        description: expectString(inputYaml, 'description'),
    }
    if ('default' in inputYaml) {
        if (isStringLike(inputYaml.default)) {
            input.default = convertStringLike(inputYaml.default)
        } else {
            throw new Error()
        }
    }
    if ('required' in inputYaml) {
        if (isBoolean(inputYaml.required)) {
            input.required = inputYaml.required
        } else {
            throw new Error()
        }
    }
    if ('deprecationMessage' in inputYaml) {
        if (isStringLike(inputYaml.deprecationMessage)) {
            input.deprecationMessage = convertStringLike(
                inputYaml.deprecationMessage,
            )
        } else {
            throw new Error()
        }
    }
    return input as GHActionInput
}

// function collectOutputs(outputsYaml: unknown): Record<string, GHActionOutput> {
//     if (!isMap(outputsYaml)) {
//         throw new Error()
//     }
//     const outputs: Record<string, GHActionOutput> = {}
//     for (const [outputId, outputYaml] of Object.entries(outputsYaml)) {
//         outputs[outputId] = parseOutput(outputYaml)
//     }
//     return outputs
// }
//
// function parseOutput(outputYaml: unknown): GHActionOutput {
//     if (!isMap(outputYaml)) {
//         throw new Error()
//     }
//     return {
//         description: expectString(outputYaml, 'description'),
//     }
// }
