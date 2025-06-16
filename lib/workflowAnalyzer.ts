import type { FileReader } from './fileReader.ts'
import type { GHAction, GHWorkflow } from './model.ts'
import { GHWorkflowError } from './workflowError.ts'

class RuntimeError extends Error {
    constructor(message: string) {
        super(message)
        this.name = this.constructor.name
    }
}

export class GHWorkflowAnalyzer {
    #reader: FileReader

    constructor(reader: FileReader) {
        this.#reader = reader
    }

    async analyzeWorkflow(wfPath: string) {
        const workflow = await this.#reader.workflowFromFilesystem(wfPath)
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
        if (job.__KIND === 'uses') {
            let usesWorkflow: GHWorkflow
            switch (job.uses.__KIND) {
                case 'filesystem':
                    usesWorkflow = await this.#reader.workflowFromFilesystem(
                        job.uses.path,
                        workflow,
                    )
                    break
                case 'repository':
                    usesWorkflow = await this.#reader.workflowFromRepository(
                        job.uses,
                        workflow,
                    )
                    break
                default:
                    throw new TypeError(
                        'job.uses.__KIND=' + (job.uses as any).__KIND,
                    )
            }

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
        } else if (job.__KIND === 'steps') {
            for (const [stepIndex, step] of Object.entries(job.steps)) {
                if (step.__KIND === 'uses') {
                    if (step.uses.__KIND === 'repository') {
                        const action: GHAction =
                            await this.#reader.actionFromRepository(
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
