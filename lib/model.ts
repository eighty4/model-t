export type GHAction = {
    name: string
    description: string
    author?: string
    branding?: GHActionBranding
    runs: GHActionRuns
    inputs?: Record<string, GHActionInput>
    outputs?: Record<string, GHActionOutput>
}

export type GHActionBranding = {
    color: string
    icon: string
}

export type GHActionRuns =
    | {
          using: 'composite'
          steps: Array<any>
      }
    | {
          using: 'docker'
          image: string
          args?: Array<string>
          env?: Record<string, string>
          preEntrypoint?: string
          preIf?: string
          entrypoint?: string
          postEntrypoint?: string
          postIf?: string
      }
    | {
          using: 'node20'
          pre?: string
          preIf?: string
          main: string
          post?: string
          postIf?: string
      }

export type GHActionInput = {
    description: string
    required?: boolean
    default?: string
    deprecationMessage?: string
}

export type GHActionOutput = {
    description?: string
}

// export type GHPermissionAccessLevel = 'read' | 'write' | 'none'
// const GHWorkflowImageValues = ['ubuntu-latest'] as const
// export type GHWorkflowImage = (typeof GHWorkflowImageValues)[number]

export type GHWorkflow = {
    __PATH?: string
    on: GHWorkflowOnEvents
    jobs: Record<string, GHWorkflowJob>
    // name?: string
    // runName?: string
    // permissions: Record<string, string>
    // env: Record<string, string>
    // defaults
    // concurrency
}

export type GHWorkflowOnEvents = Partial<{
    pull_request: GHWorkflowOnPullRequest
    push: GHWorkflowOnPush
    workflow_call: GHWorkflowOnWorkflowCall
    workflow_dispatch: GHWorkflowOnWorkflowDispatch
}>

export const GHWorkflowEvents = [
    'pull_request',
    'push',
    'workflow_call',
    'workflow_dispatch',
] as const

export type GHWorkflowEvent = (typeof GHWorkflowEvents)[number]

export type GHWorkflowOnEvent<T extends GHWorkflowEvent> = {
    __KIND: T
}

export interface GHWorkflowOnPullRequest
    extends GHWorkflowOnEvent<'pull_request'> {
    branches?: Array<string>
    branchesIgnore?: Array<string>
}

export interface GHWorkflowOnPush extends GHWorkflowOnEvent<'push'> {
    branches?: Array<string>
    branchesIgnore?: Array<string>
    tags?: Array<string>
    tagsIgnore?: Array<string>
}

export interface GHWorkflowOnWorkflowCall
    extends GHWorkflowOnEvent<'workflow_call'> {
    inputs?: Record<string, GHWorkflowCallInput>
}

export type GHWorkflowCallInput =
    | GHWorkflowInputBoolean
    | GHWorkflowInputNumber
    | GHWorkflowInputString

export interface GHWorkflowOnWorkflowDispatch
    extends GHWorkflowOnEvent<'workflow_dispatch'> {
    inputs?: Record<string, GHWorkflowDispatchInput>
}

export type GHWorkflowDispatchInput =
    | GHWorkflowInputBoolean
    | GHWorkflowInputChoice
    | GHWorkflowInputEnvironment
    | GHWorkflowInputNumber
    | GHWorkflowInputString

export type GHWorkflowInputBoolean = GHWorkflowInputCommonProps<boolean> & {
    type: 'boolean'
}

export type GHWorkflowInputNumber = GHWorkflowInputCommonProps<number> & {
    type: 'number'
}

export type GHWorkflowInputString = GHWorkflowInputCommonProps<string> & {
    type: 'string'
}

export type GHWorkflowInputChoice = GHWorkflowInputCommonProps<string> & {
    type: 'choice'
    options: Array<string>
}

export type GHWorkflowInputEnvironment = GHWorkflowInputCommonProps<string> & {
    type: 'environment'
}

export type GHWorkflowInputCommonProps<T> = {
    default?: T
    description?: string
    required?: boolean
}

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
    with?: Record<string, boolean | number | string>
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
    uses: GHWorkflowActionSpecifier
    with?: Record<string, boolean | number | string>
}

export type GHWorkflowActionSpecifier =
    | {
          // action ran from a container registry
          __KIND: 'docker'
          uri: string
      }
    | {
          // action resolved by filesystem path
          __KIND: 'filesystem'
          path: string
      }
    | {
          // action reoslved from a public repository
          __KIND: 'repository'
          owner: string
          repo: string
          subdirectory?: string
          ref?: string
      }
