import {
    type FileFetcher,
    FileNotFoundError,
    type RepoObjectFetcher,
} from './fileFetcher.ts'
import type { GHWorkflow } from './model.ts'
import { readActionModel } from './readAction.ts'
import {
    type GHWorkflowSchemaError,
    readWorkflowModel,
} from './readWorkflow.ts'

export type GHWorkflowErrorCode =
    | 'FILE_NOT_FOUND'
    | 'WORKFLOW_RUNTIME'
    | 'WORKFLOW_SCHEMA'

export class GHWorkflowError extends Error {
    code: GHWorkflowErrorCode
    workflow: string
    referencedBy: string | null
    schemaErrors: Array<GHWorkflowSchemaError> | null

    constructor(
        code: GHWorkflowErrorCode,
        workflow: string,
        referencedBy: string | null,
        schemaErrors: Array<GHWorkflowSchemaError> | null,
    ) {
        super(code)
        this.name = this.constructor.name
        this.code = code
        this.workflow = workflow
        this.referencedBy = referencedBy
        this.schemaErrors = schemaErrors
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
            Object.keys(workflow.jobs).map(jobId =>
                this.#analyzeJob(workflow, jobId),
            ),
        )
    }

    async #analyzeJob(workflow: GHWorkflow, jobId: string): Promise<void> {
        const job = workflow.jobs[jobId]
        if (job.__KIND === 'uses' && job.uses.startsWith('./')) {
            const usesWorkflow = await this.#getWorkflow(job.uses, workflow)
            const onCall = usesWorkflow.on.workflow_call
            if (!onCall) {
                throw new Error(
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
                            throw new Error(
                                `input \`${inputId}\` is required to call workflow from job \`${jobId}\``,
                            )
                        } else if (
                            !isValidInputDataType(input.type, job.with[inputId])
                        ) {
                            throw new Error(
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
                        const action = readActionModel(
                            await this.#repoObjects.fetchActionMetadata(
                                step.uses.owner,
                                step.uses.repo,
                                step.uses.ref,
                                step.uses.subdirectory,
                            ),
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
                                        throw new Error(
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

    async #readWorkflow(
        p: string,
        referencedBy?: GHWorkflow,
    ): Promise<GHWorkflow> {
        try {
            const wfYaml = await this.#files.fetchFile(p)
            const { workflow, schemaErrors } = readWorkflowModel(wfYaml)
            if (schemaErrors.length) {
                throw new GHWorkflowError(
                    'WORKFLOW_SCHEMA',
                    p,
                    referencedBy?.__PATH || null,
                    schemaErrors,
                )
            } else {
                workflow.__PATH = p
                return workflow
            }
        } catch (e: unknown) {
            if (e instanceof FileNotFoundError) {
                throw new GHWorkflowError(
                    'FILE_NOT_FOUND',
                    p,
                    referencedBy?.__PATH || null,
                    null,
                )
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
