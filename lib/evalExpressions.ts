// represents any string of a gh workflow that can eval expressions
// at runtime
export type GHWorkflowEvalable = {
    // models of `${{ }}` occurences within string
    expressions: Array<GHWorkflowExpression> | null
    // the original string
    sourceValue: string
}

// expressions are parsed for dependencies on context references
export type GHWorkflowExpression = {
    // any contexts referenced by expression
    contextRefs: Array<GHWorkflowContextRef> | null
    // index of first char of `${{` start of expression
    startIndex: number
    // index of last char of `}}` end of expression
    endIndex: number
}

export type GHWorkflowContext =
    | 'github'
    | 'env'
    | 'inputs'
    | 'secrets'
    | 'vars'
    | 'needs'
    | 'strategy'
    | 'matrix'
    | 'job'
    | 'jobs'
    | 'steps'
    | 'runner'

export type GHWorkflowContextRef = {
    context: GHWorkflowContext
    // `inputs.xyz` or `steps.abc.outputs.xyz`
    ref: string
}
