// export type GHPermissionAccessLevel = 'read' | 'write' | 'none'
// const GHWorkflowImageValues = ['ubuntu-latest'] as const
// export type GHWorkflowImage = (typeof GHWorkflowImageValues)[number]

export type GHWorkflow = {
    jobs: Record<string, GHWorkflowJob>
    // name?: string
    // runName?: string
    // on
    // permissions: Record<string, string>
    // env: Record<string, string>
    // defaults
    // concurrency
}

//export type GHWorkflowInput = {
// description?: string
// default?: string
// options?: Array<string>
// required?: boolean
// type?: 'boolean' | 'string' | 'choice' | 'environment' | 'number'
//}

export type GHWorkflowJob = GHWorkflowJobRunsSteps | GHWorkflowJobUsesWorkflow

export type GHWorkflowJobCommonProps = {
    if?: string
    name?: string
    needs?: Array<string>
    // outputs
    // permissions
    // secrets
    // strategy
    // timeout-minutes
    // concurrency
    // environment
    // defaults
    // services
    // container
    // continue-on-error
}

export type GHWorkflowJobRunsSteps = GHWorkflowJobCommonProps & {
    __KIND: 'steps'
    runsOn: string | Array<string> | { group: string; labels: Array<string> }
    steps: Array<GHWorkflowStep>
    env?: Record<string, string>
}

export type GHWorkflowJobUsesWorkflow = GHWorkflowJobCommonProps & {
    __KIND: 'uses'
    uses: string
    with?: Record<string, string>
} & GHWorkflowJobCommonProps

export type GHWorkflowStep = GHWorkflowStepRunsShell | GHWorkflowStepUsesAction

export type GHWorkflowStepCommonProps = {
    id?: string
    if?: string
    name?: string
    // continue-on-error
    // timeout-minutes
    // with.args
    // with.entrypoint
    // working-directory
}

export type GHWorkflowStepRunsShell = GHWorkflowStepCommonProps & {
    __KIND: 'run'
    run: string
    env?: Record<string, string>
    // working-directory
    // shell
}

export type GHWorkflowStepUsesAction = GHWorkflowStepCommonProps & {
    __KIND: 'uses'
    uses: string
    with?: Record<string, string>
}
