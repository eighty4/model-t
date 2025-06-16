export type GHActionSchemaError = {
    message: string
    object?: 'action' | 'input' | 'output'
    path: string
}

export type GHWorkflowSchemaError = {
    message: string
    object?: 'workflow' | 'event' | 'job' | 'step' | 'input' | 'output'
    path: string
}

export type GHWorkflowErrorCode =
    | 'ACTION_NOT_FOUND'
    | 'ACTION_SCHEMA'
    | 'WORKFLOW_NOT_FOUND'
    | 'WORKFLOW_RUNTIME'
    | 'WORKFLOW_SCHEMA'

export class GHWorkflowError extends Error {
    code: GHWorkflowErrorCode
    workflow: string
    action: string | null
    referencedBy: string | null
    schemaErrors: Array<GHActionSchemaError | GHWorkflowSchemaError> | null

    constructor(
        code: GHWorkflowErrorCode,
        workflow: string,
        metadata: {
            action?: string
            message?: string
            referencedBy?: string
            schemaErrors?: Array<GHActionSchemaError | GHWorkflowSchemaError>
        },
    ) {
        super(metadata?.message || code)
        this.name = this.constructor.name
        this.code = code
        this.workflow = workflow
        this.action = metadata.action || null
        this.referencedBy = metadata.referencedBy || null
        this.schemaErrors = metadata.schemaErrors || null
    }
}
