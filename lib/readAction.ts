import type { GHAction, GHActionInput } from './model.ts'
import {
    convertStringLike,
    isBoolean,
    isMap,
    isStringLike,
    readYaml,
} from './readingFns.ts'
import type { GHActionSchemaError } from './workflowError.ts'

export type GHActionReadResult = {
    action: GHAction
    schemaErrors: Array<GHActionSchemaError>
}

class SchemaError {
    schemaError
    constructor(schemaError: GHActionSchemaError) {
        this.schemaError = schemaError
    }
}

export function readActionModel(s: string): GHActionReadResult {
    const actionYaml = readYaml(s)
    const action: Partial<GHAction> = {}
    const schemaErrors: Array<GHActionSchemaError> = []
    //action.name = expectString(actionYaml, 'name')
    //if ('author' in actionYaml) {
    //    action.author = parseString(actionYaml.author)
    //}
    //action.description = expectString(actionYaml, 'description')
    if ('inputs' in actionYaml) {
        action.inputs = collectInputs(actionYaml.inputs, schemaErrors)
    }
    //if ('outputs' in actionYaml) {
    //    action.outputs = collectOutputs(actionYaml.outputs)
    //}
    return {
        action: action as GHAction,
        schemaErrors,
    }
}

function collectInputs(
    inputsYaml: unknown,
    schemaErrors: Array<GHActionSchemaError>,
): Record<string, GHActionInput> {
    if (!isMap(inputsYaml)) {
        schemaErrors.push({
            message: 'Must be a map of inputs',
            path: 'inputs',
        })
        return {}
    }
    const inputs: Record<string, GHActionInput> = {}
    for (const [inputId, inputYaml] of Object.entries(inputsYaml)) {
        try {
            inputs[inputId] = parseInput(inputYaml, inputId)
        } catch (e: unknown) {
            if (e instanceof SchemaError) {
                schemaErrors.push(e.schemaError)
            } else {
                throw e
            }
        }
    }
    return inputs
}

function parseInput(inputYaml: unknown, inputId: string): GHActionInput {
    if (!isMap(inputYaml)) {
        throw new SchemaError({
            message: 'Must be a map of input properties',
            path: `inputs.${inputId}`,
        })
    }
    if (!('description' in inputYaml)) {
        throw new SchemaError({
            message: 'Field is required',
            path: `inputs.${inputId}.description`,
        })
    }
    if (!isStringLike(inputYaml.description)) {
        throw new SchemaError({
            message: 'Must be a string',
            path: `inputs.${inputId}.description`,
        })
    }
    const input: Partial<GHActionInput> = {
        description: convertStringLike(inputYaml.description),
    }
    if ('default' in inputYaml) {
        if (inputYaml.default === null) {
            input.default = null
        } else if (isStringLike(inputYaml.default)) {
            input.default = convertStringLike(inputYaml.default)
        } else {
            throw new SchemaError({
                message: 'Must be a string or null',
                path: `inputs.${inputId}.default`,
            })
        }
    }
    if ('required' in inputYaml) {
        if (isBoolean(inputYaml.required)) {
            input.required = inputYaml.required
        } else {
            throw new SchemaError({
                message: 'Must be a boolean',
                path: `inputs.${inputId}.required`,
            })
        }
    }
    if ('deprecationMessage' in inputYaml) {
        if (isStringLike(inputYaml.deprecationMessage)) {
            input.deprecationMessage = convertStringLike(
                inputYaml.deprecationMessage,
            )
        } else {
            throw new SchemaError({
                message: 'Must be a string',
                path: `inputs.${inputId}.deprecationMessage`,
            })
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
