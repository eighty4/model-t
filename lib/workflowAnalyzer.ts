import {
    type FileFetcher,
    FileNotFoundError,
    GitHubApiNotFound,
    NetworkError,
    type RepoObjectFetcher,
} from './fileFetcher.ts'
import type { GHAction, GHWorkflow } from './model.ts'
import { type GHActionSchemaError, readActionModel } from './readAction.ts'
import {
    type GHWorkflowSchemaError,
    readWorkflowModel,
} from './readWorkflow.ts'

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

class RuntimeError extends Error {
    constructor(message: string) {
        super(message)
        this.name = this.constructor.name
    }
}

export class GHWorkflowAnalyzer {
    #files: FileFetcher
    #repoObjects: RepoObjectFetcher
    #workflows: Record<string, Promise<GHWorkflow>>

    constructor(files: FileFetcher, repoObjects: RepoObjectFetcher) {
        this.#files = files
        this.#repoObjects = repoObjects
        this.#workflows = {}
    }

    async analyzeWorkflow(wfPath: string) {
        const workflow = await this.#getWorkflow(wfPath)
        await Promise.all(
            Object.keys(workflow.jobs).map(async jobId => {
                try {
                    await this.#analyzeJob(workflow, jobId)
                } catch (e: unknown) {
                    if (e instanceof RuntimeError) {
                        throw new GHWorkflowError(
                            'WORKFLOW_RUNTIME',
                            workflow.__PATH!,
                            { message: e.message },
                        )
                    } else {
                        throw e
                    }
                }
            }),
        )
    }

    async #analyzeJob(workflow: GHWorkflow, jobId: string): Promise<void> {
        const job = workflow.jobs[jobId]
        if (job.__KIND === 'uses' && job.uses.startsWith('./')) {
            const usesWorkflow = await this.#getWorkflow(job.uses, workflow)
            const onCall = usesWorkflow.on.workflow_call
            if (!onCall) {
                throw new RuntimeError(
                    `job \`${jobId}\` using a workflow requires \`on.workflow_call:\` in the called workflow`,
                )
            }
            if (onCall.inputs) {
                for (const [inputId, input] of Object.entries(onCall.inputs)) {
                    if (
                        input.required &&
                        typeof input.default === 'undefined'
                    ) {
                        if (!job.with || !(inputId in job.with)) {
                            throw new RuntimeError(
                                `input \`${inputId}\` is required to call workflow from job \`${jobId}\``,
                            )
                        } else if (
                            !isValidInputDataType(input.type, job.with[inputId])
                        ) {
                            throw new RuntimeError(
                                `input \`${inputId}\` is a \`${input.type}\` input and job \`${jobId}\` cannot call workflow with a \`${typeof job.with[inputId]}\` value`,
                            )
                        }
                    }
                }
            }
        }
        if (job.__KIND === 'steps') {
            for (const [stepIndex, step] of Object.entries(job.steps)) {
                if (step.__KIND === 'uses') {
                    if (step.uses.__KIND === 'repository') {
                        const action = await this.#readAction(
                            step.uses,
                            workflow,
                        )
                        if (action.inputs) {
                            for (const [inputId, input] of Object.entries(
                                action.inputs,
                            )) {
                                if (
                                    input.required &&
                                    typeof input.default === 'undefined'
                                ) {
                                    if (!step.with || !(inputId in step.with)) {
                                        throw new RuntimeError(
                                            `input \`${inputId}\` is required to call action \`${step.uses.specifier}\` from \`${step.id || step.name || `step[${stepIndex}]`}\` in job \`${jobId}\``,
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    async #getWorkflow(
        p: string,
        referencedBy?: GHWorkflow,
    ): Promise<GHWorkflow> {
        return (
            this.#workflows[p] ||
            (this.#workflows[p] = this.#readWorkflow(p, referencedBy))
        )
    }

    async #readAction(
        actionSpec: {
            owner: string
            repo: string
            ref: string
            specifier: string
            subdirectory?: string
        },
        referencedBy: GHWorkflow,
    ): Promise<GHAction> {
        try {
            const { action, schemaErrors } = readActionModel(
                await this.#repoObjects.fetchActionMetadata(
                    actionSpec.owner,
                    actionSpec.repo,
                    actionSpec.ref,
                    actionSpec.subdirectory,
                ),
            )
            if (schemaErrors.length) {
                throw new GHWorkflowError(
                    'ACTION_SCHEMA',
                    referencedBy.__PATH!,
                    { action: actionSpec.specifier, schemaErrors },
                )
            } else {
                return action
            }
        } catch (e) {
            // todo handle NetworkError by validating locally and skipping
            //  validations of remote resources
            if (e instanceof GitHubApiNotFound || e instanceof NetworkError) {
                throw new GHWorkflowError(
                    'ACTION_NOT_FOUND',
                    referencedBy.__PATH!,
                    { action: actionSpec.specifier },
                )
            } else {
                throw e
            }
        }
    }

    async #readWorkflow(
        p: string,
        referencedBy?: GHWorkflow,
    ): Promise<GHWorkflow> {
        try {
            const wfYaml = await this.#files.fetchFile(p)
            const { workflow, schemaErrors } = readWorkflowModel(wfYaml)
            if (schemaErrors.length) {
                throw new GHWorkflowError('WORKFLOW_SCHEMA', p, {
                    referencedBy: referencedBy?.__PATH,
                    schemaErrors,
                })
            } else {
                workflow.__PATH = p
                return workflow
            }
        } catch (e: unknown) {
            if (e instanceof FileNotFoundError) {
                throw new GHWorkflowError('WORKFLOW_NOT_FOUND', p, {
                    referencedBy: referencedBy?.__PATH,
                })
            } else {
                throw e
            }
        }
    }
}

const VALID_DATA_TYPES: Record<string, Array<string>> = {
    boolean: ['boolean'],
    number: ['number'],
    string: ['boolean', 'number', 'string'],
    choice: ['boolean', 'number', 'string'],
    environment: ['string'],
}

// todo eval expressions in `data` when string to determine if resolves to
//  boolean or number
function isValidInputDataType(type: string, data: unknown) {
    const dataType = typeof data
    const isValidDataType = VALID_DATA_TYPES[type].some(
        validType => validType === dataType,
    )
    if (isValidDataType || dataType !== 'string') {
        return isValidDataType
    }
    // not flagging invalid if string is an expression bc the result is unknown
    return reduceExpressionsFromString(data as string) === ''
}

function reduceExpressionsFromString(data: string) {
    let s = data
    while (/\${{.*}}/.test(s)) {
        s = s.replace(/\${{.*}}/, '')
    }
    return s.trim()
}
