import type {
    GHWorkflow,
    GHWorkflowActionSpecifier,
    GHWorkflowCallInput,
    GHWorkflowCallSpecifier,
    GHWorkflowDispatchInput,
    GHWorkflowEvent,
    GHWorkflowInputBoolean,
    GHWorkflowInputChoice,
    GHWorkflowInputCommonProps,
    GHWorkflowInputEnvironment,
    GHWorkflowInputNumber,
    GHWorkflowInputString,
    GHWorkflowJob,
    GHWorkflowJobRunsSteps,
    GHWorkflowJobUsesWorkflow,
    GHWorkflowOnEvents,
    GHWorkflowOnPullRequest,
    GHWorkflowOnPush,
    GHWorkflowOnWorkflowCall,
    GHWorkflowOnWorkflowDispatch,
    GHWorkflowStep,
    GHWorkflowStepRunsShell,
    GHWorkflowStepUsesAction,
} from './model.ts'
import { GHWorkflowEvents } from './model.ts'
import {
    convertMapOfStringLikes,
    convertStringLike,
    isArrayOfMaps,
    isArrayOfStringLikes,
    isArrayOfStrings,
    isBoolean,
    isMap,
    isMapOfStringLikes,
    isNumber,
    isString,
    isStringLike,
    readYaml,
} from './readingFns.ts'
import type { GHWorkflowSchemaError } from './workflowError.ts'

const jobAndStepIdRegex = /^[_a-z]{1}[_\-a-z\d]+$/

// determines what props are no longer supported given use of another feature
const UNSUPPORTED_PROPS = Object.freeze({
    JOB_WITH_USES: ['env'],
    JOB_WITH_STEPS: [],
    STEP_WITH_USES: ['env'],
    STEP_WITH_RUN: [],
})

class SchemaError {
    schemaError: GHWorkflowSchemaError
    constructor(schemaError: GHWorkflowSchemaError) {
        this.schemaError = schemaError
    }
}

export type GHWorkflowReadResult = {
    workflow: GHWorkflow
    schemaErrors: Array<GHWorkflowSchemaError>
}

export function readWorkflowModel(s: string): GHWorkflowReadResult {
    const wfYaml = readYaml(s)
    const schemaErrors: Array<GHWorkflowSchemaError> = []
    const on = collectEventCfgs(wfYaml, schemaErrors)
    const jobs = collectJobs(wfYaml, schemaErrors)
    checkUnsupportedWorkflowKeys(wfYaml, schemaErrors)
    if ('defaults' in wfYaml) {
        if (isMap(wfYaml.defaults)) {
            checkUnsupportedDefaultsKeys(wfYaml.defaults, schemaErrors)
        } else {
            schemaErrors.push({
                message: 'Must be an object of workflow defaults config',
                object: 'workflow',
                path: 'defaults',
            })
        }
    }
    return {
        workflow: {
            on,
            jobs,
        },
        schemaErrors,
    }
}

function isWorkflowEvent(v: string): v is GHWorkflowEvent {
    return GHWorkflowEvents.includes(v as GHWorkflowEvent)
}

function collectEventCfgs(
    wfYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
): GHWorkflowOnEvents {
    const on: GHWorkflowOnEvents = {}
    if ('on' in wfYaml) {
        if (isArrayOfStrings(wfYaml.on)) {
            for (const event of wfYaml.on) {
                if (isWorkflowEvent(event)) {
                    setEmptyOnWorkflowCfg(on, event)
                } else {
                    schemaErrors.push({
                        message: `\`${event}\` is not a valid workflow trigger event name`,
                        object: 'event',
                        path: `on.${event}`,
                    })
                    continue
                }
            }
        } else if (!isMap(wfYaml.on)) {
            schemaErrors.push({
                message:
                    'Must be an array or map of workflow triggering events',
                object: 'workflow',
                path: 'on',
            })
        } else {
            for (const [event, cfgYaml] of Object.entries(wfYaml.on)) {
                try {
                    if (!isWorkflowEvent(event)) {
                        throw new SchemaError({
                            message: `\`${event}\` is not a valid workflow trigger event name`,
                            object: 'event',
                            path: `on.${event}`,
                        })
                    } else if (cfgYaml === null) {
                        setEmptyOnWorkflowCfg(on, event)
                    } else if (!isMap(cfgYaml)) {
                        throw new SchemaError({
                            message: `Must be a map of event configuration`,
                            object: 'event',
                            path: `on.${event}`,
                        })
                    } else {
                        switch (event) {
                            case 'pull_request':
                                on['pull_request'] =
                                    parsePullRequestCfg(/*cfgYaml*/)
                                break
                            case 'push':
                                on['push'] = parsePushCfg(/*cfgYaml*/)
                                break
                            case 'workflow_call':
                                on['workflow_call'] = parseWorkflowCallCfg(
                                    cfgYaml,
                                    schemaErrors,
                                )
                                break
                            case 'workflow_dispatch':
                                on['workflow_dispatch'] =
                                    parseWorkflowDispatchCfg(
                                        cfgYaml,
                                        schemaErrors,
                                    )
                                break
                            default:
                                throw new Error('unhandled wf event ' + event)
                        }
                    }
                } catch (e: unknown) {
                    if (e instanceof SchemaError) {
                        schemaErrors.push(e.schemaError)
                    } else {
                        throw e
                    }
                }
            }
        }
    }
    return on
}

function setEmptyOnWorkflowCfg(on: GHWorkflowOnEvents, event: GHWorkflowEvent) {
    switch (event) {
        case 'pull_request':
            on[event] = { __KIND: event }
            break
        case 'push':
            on[event] = { __KIND: event }
            break
        case 'workflow_call':
            on[event] = { __KIND: event }
            break
        case 'workflow_dispatch':
            on[event] = { __KIND: event }
            break
        default:
            throw new Error('unhandled wf event ' + event)
    }
}

function parsePullRequestCfg(): GHWorkflowOnPullRequest {
    return {
        __KIND: 'pull_request',
    }
}

function parsePushCfg(): GHWorkflowOnPush {
    return {
        __KIND: 'push',
    }
}

function parseWorkflowCallCfg(
    cfgYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
): GHWorkflowOnWorkflowCall {
    const cfg: Partial<GHWorkflowOnWorkflowCall> = { __KIND: 'workflow_call' }
    if (isValidInputsMap(cfgYaml, schemaErrors, 'workflow_call')) {
        cfg.inputs = collectEventInputs<GHWorkflowCallInput>(
            cfgYaml,
            schemaErrors,
            'workflow_call',
        )
    }
    return cfg as GHWorkflowOnWorkflowCall
}

function parseWorkflowDispatchCfg(
    cfgYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
): GHWorkflowOnWorkflowDispatch {
    const cfg: Partial<GHWorkflowOnWorkflowDispatch> = {
        __KIND: 'workflow_dispatch',
    }
    if (isValidInputsMap(cfgYaml, schemaErrors, 'workflow_dispatch')) {
        cfg.inputs = collectEventInputs<GHWorkflowDispatchInput>(
            cfgYaml,
            schemaErrors,
            'workflow_dispatch',
        )
    }
    return cfg as GHWorkflowOnWorkflowDispatch
}

function isValidInputsMap(
    cfgYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    event: 'workflow_call' | 'workflow_dispatch',
): cfgYaml is { inputs: Record<string, unknown> } {
    if ('inputs' in cfgYaml) {
        if (cfgYaml.inputs === null || !isMap(cfgYaml.inputs)) {
            schemaErrors.push({
                message: 'Must be a map of workflow inputs',
                object: 'event',
                path: `on.${event}.inputs`,
            })
        } else {
            return true
        }
    }
    return false
}

function collectEventInputs<T>(
    cfgYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    event: 'workflow_call' | 'workflow_dispatch',
): Record<string, T> | undefined {
    if ('inputs' in cfgYaml) {
        if (cfgYaml.inputs === null || !isMap(cfgYaml.inputs)) {
            schemaErrors.push({
                message: 'Must be a map of workflow inputs',
                object: 'event',
                path: `on.${event}.inputs`,
            })
        } else {
            const inputs: Record<string, GHWorkflowDispatchInput> = {}
            for (const [inputId, inputYaml] of Object.entries(cfgYaml.inputs)) {
                try {
                    if (isValidInput(inputYaml, inputId, event)) {
                        switch (inputYaml.type) {
                            case 'boolean':
                                inputs[inputId] = parseBooleanInput(
                                    inputYaml,
                                    schemaErrors,
                                    event,
                                    inputId,
                                )
                                break
                            case 'number':
                                inputs[inputId] = parseNumberInput(
                                    inputYaml,
                                    schemaErrors,
                                    event,
                                    inputId,
                                )
                                break
                            case 'string':
                                inputs[inputId] = parseStringInput(
                                    inputYaml,
                                    schemaErrors,
                                    event,
                                    inputId,
                                )
                                break
                            case 'choice':
                                inputs[inputId] = parseChoiceInput(
                                    inputYaml,
                                    schemaErrors,
                                    inputId,
                                )
                                break
                            case 'environment':
                                inputs[inputId] = parseEnvironmentInput(
                                    inputYaml,
                                    schemaErrors,
                                    inputId,
                                )
                                break
                        }
                    }
                } catch (e: unknown) {
                    if (e instanceof SchemaError) {
                        schemaErrors.push(e.schemaError)
                    } else {
                        throw e
                    }
                }
            }
            return inputs as Record<string, T>
        }
    }
}

const INPUT_TYPES = {
    workflow_call: ['boolean', 'number', 'string'],
    workflow_dispatch: ['boolean', 'choice', 'environment', 'number', 'string'],
}

const INPUT_PROPS = ['default', 'description', 'required', 'type']

function isValidInput(
    inputYaml: unknown,
    inputId: string,
    event: 'workflow_call' | 'workflow_dispatch',
): inputYaml is Record<string, unknown> {
    if (!isMap(inputYaml)) {
        throw new SchemaError({
            message: 'Must be a map of input configuration',
            object: 'input',
            path: `on.${event}.inputs.${inputId}`,
        })
    } else if (!('type' in inputYaml)) {
        throw new SchemaError({
            message: `\`${inputYaml.type}\` must explicitly have an input type`,
            object: 'input',
            path: `on.${event}.inputs.${inputId}.type`,
        })
    } else if (!isString(inputYaml.type)) {
        throw new SchemaError({
            message: 'Must be a string',
            object: 'input',
            path: `on.${event}.inputs.${inputId}.type`,
        })
    } else if (!INPUT_TYPES[event].includes(inputYaml.type)) {
        throw new SchemaError({
            message: `\`${inputYaml.type}\` is not a valid ${event} input type`,
            object: 'input',
            path: `on.${event}.inputs.${inputId}.type`,
        })
    } else {
        const invalidProps = Object.keys(inputYaml).filter(prop => {
            return !(
                INPUT_PROPS.includes(prop) ||
                (inputYaml.type === 'choice' && prop === 'options')
            )
        })
        if (invalidProps.length) {
            throw new SchemaError({
                message:
                    invalidProps.length === 1
                        ? `\`${inputId}\` cannot have field \`${invalidProps[0]}\``
                        : `\`${inputId}\` cannot have fields: ${invalidProps
                              .sort()
                              .map(prop => `\`${prop}\``)
                              .join(', ')}`,
                object: 'input',
                path: `on.${event}.inputs.${inputId}`,
            })
        }
    }
    return true
}

function parseInputProps(
    input: GHWorkflowInputCommonProps<any>,
    inputYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    event: 'workflow_call' | 'workflow_dispatch',
    inputId: string,
) {
    if ('description' in inputYaml) {
        if (isStringLike(inputYaml.description)) {
            input.description = convertStringLike(inputYaml.description)
        } else {
            schemaErrors.push({
                message: 'Must be a string',
                object: 'input',
                path: `on.${event}.inputs.${inputId}.description`,
            })
        }
    }
    if ('required' in inputYaml) {
        if (isBoolean(inputYaml.required)) {
            input.required = inputYaml.required
        } else {
            schemaErrors.push({
                message: 'Must be a boolean',
                object: 'input',
                path: `on.${event}.inputs.${inputId}.required`,
            })
        }
    }
}

function parseBooleanInput(
    inputYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    event: 'workflow_call' | 'workflow_dispatch',
    inputId: string,
): GHWorkflowInputBoolean {
    const input: GHWorkflowInputBoolean = { type: 'boolean' }
    parseInputProps(input, inputYaml, schemaErrors, event, inputId)
    if ('default' in inputYaml) {
        if (isBoolean(inputYaml.default)) {
            input.default = inputYaml.default
        } else {
            throw new SchemaError({
                message: 'Must be a boolean',
                object: 'input',
                path: `on.${event}.inputs.${inputId}.default`,
            })
        }
    }
    return input
}

function parseNumberInput(
    inputYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    event: 'workflow_call' | 'workflow_dispatch',
    inputId: string,
): GHWorkflowInputNumber {
    const input: GHWorkflowInputNumber = { type: 'number' }
    parseInputProps(input, inputYaml, schemaErrors, event, inputId)
    if ('default' in inputYaml) {
        if (isNumber(inputYaml.default)) {
            input.default = inputYaml.default
        } else {
            throw new SchemaError({
                message: 'Must be a number',
                object: 'input',
                path: `on.${event}.inputs.${inputId}.default`,
            })
        }
    }
    return input
}

function parseStringInput(
    inputYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    event: 'workflow_call' | 'workflow_dispatch',
    inputId: string,
): GHWorkflowInputString {
    const input: GHWorkflowInputString = { type: 'string' }
    parseInputProps(input, inputYaml, schemaErrors, event, inputId)
    if ('default' in inputYaml) {
        if (isStringLike(inputYaml.default)) {
            input.default = convertStringLike(inputYaml.default)
        } else {
            throw new SchemaError({
                message: 'Must be a string',
                object: 'input',
                path: `on.${event}.inputs.${inputId}.default`,
            })
        }
    }
    return input
}

function parseChoiceInput(
    inputYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    inputId: string,
): GHWorkflowInputChoice {
    if (!('options' in inputYaml)) {
        throw new SchemaError({
            message: `Choice input must have \`options\``,
            object: 'input',
            path: `on.workflow_dispatch.inputs.${inputId}`,
        })
    }
    if (!isArrayOfStringLikes(inputYaml.options)) {
        throw new SchemaError({
            message: `Must be an array of strings`,
            object: 'input',
            path: `on.workflow_dispatch.inputs.${inputId}.options`,
        })
    }
    const options = inputYaml.options.map(convertStringLike)
    const input: GHWorkflowInputChoice = { type: 'choice', options }
    parseInputProps(
        input,
        inputYaml,
        schemaErrors,
        'workflow_dispatch',
        inputId,
    )
    if ('default' in inputYaml) {
        if (isStringLike(inputYaml.default)) {
            input.default = convertStringLike(inputYaml.default)
            if (!input.options.includes(input.default)) {
                throw new SchemaError({
                    message: `\`${inputYaml.default}\` is not an input option`,
                    object: 'input',
                    path: `on.workflow_dispatch.inputs.${inputId}.default`,
                })
            }
        } else {
            throw new SchemaError({
                message: 'Must be a string',
                object: 'input',
                path: `on.workflow_dispatch.inputs.${inputId}.default`,
            })
        }
    }
    return input
}

function parseEnvironmentInput(
    inputYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    inputId: string,
): GHWorkflowInputEnvironment {
    const input: GHWorkflowInputEnvironment = { type: 'environment' }
    parseInputProps(
        input,
        inputYaml,
        schemaErrors,
        'workflow_dispatch',
        inputId,
    )
    if ('default' in inputYaml) {
        if (isStringLike(inputYaml.default)) {
            input.default = convertStringLike(inputYaml.default)
        } else {
            throw new SchemaError({
                message: 'Must be a string',
                object: 'input',
                path: `on.workflow_dispatch.inputs.${inputId}.default`,
            })
        }
    }
    return input
}

function collectJobs(
    wfYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
): Record<string, GHWorkflowJob> {
    let invalidType = false
    let missingData = false
    if ('jobs' in wfYaml) {
        if (!isMap(wfYaml.jobs)) {
            invalidType = true
        } else if (!Object.keys(wfYaml.jobs).length) {
            missingData = true
        }
    } else {
        missingData = true
    }
    if (invalidType) {
        schemaErrors.push({
            object: 'workflow',
            message: 'Type of jobs is incorrect at `jobs`',
            path: 'jobs',
        })
    }
    if (missingData) {
        schemaErrors.push({
            object: 'workflow',
            message: 'No jobs defined in `jobs`',
            path: 'jobs',
        })
    }
    if (invalidType || missingData) {
        return {}
    }

    const jobsYaml = wfYaml.jobs as Record<string, unknown>
    const jobs: Record<string, GHWorkflowJob> = {}
    for (const [jobId, jobYaml] of Object.entries(jobsYaml)) {
        try {
            if (!jobAndStepIdRegex.test(jobId)) {
                throw new SchemaError({
                    message: `Job id ${jobId} must start with a letter or _ and only contain alphanumeric _ and -`,
                    object: 'job',
                    path: `jobs.${jobId}`,
                })
            }
            if (!isMap(jobYaml)) {
                throw new SchemaError({
                    object: 'job',
                    message: `Cannot have a ${typeof jobYaml} value for a job`,
                    path: `jobs.${jobId}`,
                })
            }
            checkUnsupportedJobKeys(jobYaml, schemaErrors, jobId)
            if ('container' in jobYaml) {
                if (isMap(jobYaml.container)) {
                    checkUnsupportedJobContainerKeys(
                        jobYaml.container,
                        schemaErrors,
                        jobId,
                    )
                } else {
                    schemaErrors.push({
                        message: 'Must be an object of job container config',
                        object: 'job',
                        path: `jobs.${jobId}.container`,
                    })
                }
            }
            if ('defaults' in jobYaml) {
                if (isMap(jobYaml.defaults)) {
                    checkUnsupportedDefaultsKeys(
                        jobYaml.defaults,
                        schemaErrors,
                        jobId,
                    )
                } else {
                    schemaErrors.push({
                        message: 'Must be an object of job defaults config',
                        object: 'job',
                        path: `jobs.${jobId}.defaults`,
                    })
                }
            }
            if ('services' in jobYaml) {
                if (!isMap(jobYaml.services)) {
                    schemaErrors.push({
                        message: 'Must be an object of job services configs',
                        object: 'job',
                        path: `jobs.${jobId}.services`,
                    })
                } else {
                    for (const [serviceId, serviceYaml] of Object.entries(
                        jobYaml.services,
                    )) {
                        if (isMap(serviceYaml)) {
                            checkUnsupportedJobContainerKeys(
                                serviceYaml,
                                schemaErrors,
                                jobId,
                                serviceId,
                            )
                        } else {
                            schemaErrors.push({
                                message:
                                    'Must be an object of job services configs',
                                object: 'job',
                                path: `jobs.${jobId}.services.${serviceId}`,
                            })
                        }
                    }
                }
            }
            if ('strategy' in jobYaml) {
                if (isMap(jobYaml.strategy)) {
                    checkUnsupportedJobStrategyKeys(
                        jobYaml.strategy,
                        schemaErrors,
                        jobId,
                    )
                } else {
                    schemaErrors.push({
                        message: `Must be an object of job strategy config`,
                        object: 'job',
                        path: `jobs.${jobId}.strategy`,
                    })
                }
            }
            const job: Partial<GHWorkflowJob> = {}
            if ('steps' in jobYaml && 'uses' in jobYaml) {
                throw new SchemaError({
                    message: 'Cannot define both `steps` and `uses` for a job',
                    object: 'job',
                    path: `jobs.${jobId}`,
                })
            } else if ('steps' in jobYaml) {
                const stepsJob = job as Partial<GHWorkflowJobRunsSteps>
                stepsJob.__KIND = 'steps'
                if (isArrayOfMaps(jobYaml.steps)) {
                    const steps = collectSteps(
                        jobId,
                        jobYaml.steps,
                        schemaErrors,
                    )
                    if (steps) {
                        stepsJob.steps = steps
                    }
                } else {
                    throw new SchemaError({
                        message: 'Must be an array of step configurations',
                        object: 'job',
                        path: `jobs.${jobId}.steps`,
                    })
                }
                if ('env' in jobYaml) {
                    if (isMapOfStringLikes(jobYaml.env)) {
                        stepsJob.env = convertMapOfStringLikes(jobYaml.env)
                    } else {
                        throw new SchemaError({
                            message: '`env` must be a map of strings',
                            object: 'job',
                            path: `jobs.${jobId}.env`,
                        })
                    }
                }
                if ('runs-on' in jobYaml) {
                    const runsOn = jobYaml['runs-on']
                    if (isString(runsOn)) {
                        stepsJob.runsOn = runsOn
                    } else if (isArrayOfStrings(runsOn) && runsOn.length) {
                        stepsJob.runsOn = runsOn
                    } else if (isMap(runsOn)) {
                        if (
                            Object.keys(runsOn).length === 2 &&
                            'group' in runsOn &&
                            'labels' in runsOn
                        ) {
                            if (!isString(runsOn.group)) {
                                throw new SchemaError({
                                    message: 'Must be a string',
                                    object: 'job',
                                    path: `jobs.${jobId}.runs-on.group`,
                                })
                            } else {
                                if (isString(runsOn.labels)) {
                                    stepsJob.runsOn = {
                                        group: runsOn.group,
                                        labels: [runsOn.labels],
                                    }
                                } else if (isArrayOfStrings(runsOn.labels)) {
                                    stepsJob.runsOn = {
                                        group: runsOn.group,
                                        labels: runsOn.labels,
                                    }
                                } else {
                                    throw new SchemaError({
                                        message:
                                            'Must be a string or array of strings',
                                        object: 'job',
                                        path: `jobs.${jobId}.runs-on.labels`,
                                    })
                                }
                            }
                        } else {
                            throw new SchemaError({
                                message:
                                    '`runs-on` must only have `group` and `labels` for querying runners',
                                object: 'job',
                                path: `jobs.${jobId}.runs-on`,
                            })
                        }
                    }
                }
                if (!stepsJob.runsOn) {
                    throw new SchemaError({
                        message:
                            'Must be a runner image name, array of runner labels or map defining `group` and `labels`',
                        object: 'job',
                        path: `jobs.${jobId}.runs-on`,
                    })
                }
            } else if ('uses' in jobYaml) {
                const usesJob = job as Partial<GHWorkflowJobUsesWorkflow>
                usesJob.__KIND = 'uses'
                usesJob.uses = parseJobUsesWorkflowValue(jobYaml.uses, jobId)
                if ('with' in jobYaml) {
                    if (isMapOfStringLikes(jobYaml.with)) {
                        usesJob.with = jobYaml.with
                    } else {
                        throw new SchemaError({
                            object: 'job',
                            message:
                                '`with` must be a map of booleans, numbers and strings',
                            path: `jobs.${jobId}.with`,
                        })
                    }
                }
                const unsupported = UNSUPPORTED_PROPS.JOB_WITH_USES.filter(
                    unsupported => unsupported in jobYaml,
                )
                if (unsupported.length) {
                    throw new SchemaError({
                        message: `${unsupported.map(s => `\`${s}\``).join(', ')} cannot be used with \`uses\``,
                        object: 'job',
                        path: `jobs.${jobId}`,
                    })
                }
            } else {
                throw new SchemaError({
                    message: 'Must define `steps` or `uses` for a job',
                    object: 'job',
                    path: `jobs.${jobId}`,
                })
            }
            if ('if' in jobYaml) {
                if (isStringLike(jobYaml.if)) {
                    job.if = convertStringLike(jobYaml.if)
                } else {
                    throw new SchemaError({
                        message: '`if` must be a string',
                        object: 'job',
                        path: `jobs.${jobId}.if`,
                    })
                }
            }
            if ('name' in jobYaml) {
                if (isStringLike(jobYaml.name)) {
                    job.name = convertStringLike(jobYaml.name)
                } else {
                    throw new SchemaError({
                        message: '`name` must be a string',
                        object: 'job',
                        path: `jobs.${jobId}.name`,
                    })
                }
            }
            if ('needs' in jobYaml) {
                if (isStringLike(jobYaml.needs)) {
                    job.needs = [convertStringLike(jobYaml.needs)]
                } else if (isArrayOfStringLikes(jobYaml.needs)) {
                    job.needs = jobYaml.needs.map(convertStringLike)
                } else {
                    throw new SchemaError({
                        message: '`needs` must be a string or array of strings',
                        object: 'job',
                        path: `jobs.${jobId}.needs`,
                    })
                }
            }
            jobs[jobId] = job as GHWorkflowJob
        } catch (e: unknown) {
            if (e instanceof SchemaError) {
                schemaErrors.push(e.schemaError)
            } else {
                throw e
            }
        }
    }
    return jobs
}

function parseJobUsesWorkflowValue(
    v: unknown,
    jobId: string,
): GHWorkflowCallSpecifier {
    if (!isString(v)) {
        throw new SchemaError({
            message: '`uses` must be a string',
            object: 'job',
            path: `jobs.${jobId}.uses`,
        })
    }
    if (/^\.?\.\//.test(v)) {
        return {
            __KIND: 'filesystem',
            path: v,
        }
    }
    const workflow: Partial<GHWorkflowCallSpecifier> = {
        __KIND: 'repository',
    }
    const splitOnRef = v.split('@', 2)
    const splitPaths = splitOnRef[0].split('/')
    if (
        splitPaths.length !== 5 ||
        splitPaths[2] !== '.github' ||
        splitPaths[3] !== 'workflows' ||
        !/ya?ml$/.test(splitPaths[4])
    ) {
        throw new SchemaError({
            message:
                'Must be a resolvable GitHub workflow YAML file in this repository with `./.github/workflows` or an external repository with `owner/name/.github/workflows` as a prefix',
            object: 'job',
            path: `jobs.${jobId}.uses`,
        })
    }
    if (splitOnRef.length === 1) {
        throw new SchemaError({
            message: `Must specify GitHub workflow ref in format \`${splitOnRef[0]}@{ref}\``,
            object: 'job',
            path: `jobs.${jobId}.uses`,
        })
    } else {
        // todo regex validate ref
        workflow.ref = splitOnRef[1]
    }
    workflow.owner = splitPaths[0]
    workflow.repo = splitPaths[1]
    workflow.filename = splitPaths[4]
    workflow.specifier = v
    return workflow as GHWorkflowCallSpecifier
}

function collectSteps(
    jobId: string,
    stepsYaml: Array<Record<string, unknown>>,
    schemaErrors: Array<GHWorkflowSchemaError>,
): Array<GHWorkflowStep> | undefined {
    const steps: Array<GHWorkflowStep> = []
    for (const [i, stepYaml] of stepsYaml.entries()) {
        checkUnsupportedJobStepKeys(stepYaml, schemaErrors, jobId, i)
        const step: Partial<GHWorkflowStep> = {}
        if ('id' in stepYaml) {
            if (isString(stepYaml.id) && jobAndStepIdRegex.test(stepYaml.id)) {
                step.id = stepYaml.id
            } else {
                throw new SchemaError({
                    message: `Step id ${stepYaml.id} must be a string starting with a letter or _ and only contain alphanumeric _ and -`,
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].id`,
                })
            }
        }
        if ('if' in stepYaml) {
            if (isStringLike(stepYaml.if)) {
                step.if = convertStringLike(stepYaml.if)
            } else {
                throw new SchemaError({
                    message: '`if` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].if`,
                })
            }
        }
        if ('name' in stepYaml) {
            if (isStringLike(stepYaml.name)) {
                step.name = convertStringLike(stepYaml.name)
            } else {
                throw new SchemaError({
                    message: '`name` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].name`,
                })
            }
        }
        if ('run' in stepYaml && 'uses' in stepYaml) {
            throw new Error('step cannot have run and uses')
        } else if ('run' in stepYaml) {
            const runStep = step as Partial<GHWorkflowStepRunsShell>
            runStep.__KIND = 'run'
            if (isString(stepYaml.run)) {
                runStep.run = stepYaml.run
            } else {
                throw new SchemaError({
                    message: '`run` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].run`,
                })
            }
            if ('env' in stepYaml) {
                if (isMapOfStringLikes(stepYaml.env)) {
                    runStep.env = convertMapOfStringLikes(stepYaml.env)
                } else {
                    throw new SchemaError({
                        message: '`env` must be a map of strings',
                        object: 'step',
                        path: `jobs.${jobId}.steps[${i}].env`,
                    })
                }
            }
        } else if ('uses' in stepYaml) {
            const usesStep = step as Partial<GHWorkflowStepUsesAction>
            usesStep.__KIND = 'uses'
            usesStep.uses = parseStepUsesActionValue(stepYaml.uses, jobId, i)
            if ('with' in stepYaml) {
                if (isMapOfStringLikes(stepYaml.with)) {
                    usesStep.with = stepYaml.with
                } else {
                    throw new SchemaError({
                        object: 'step',
                        message:
                            '`with` must be a map of booleans, numbers and strings',
                        path: `jobs.${jobId}.steps[${i}].with`,
                    })
                }
            }
            const unsupported = UNSUPPORTED_PROPS.STEP_WITH_USES.filter(
                unsupported => unsupported in stepYaml,
            )
            if (unsupported.length) {
                throw new SchemaError({
                    message: `${unsupported.map(s => `\`${s}\``).join(', ')} cannot be used with \`uses\``,
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}]`,
                })
            }
        } else {
            throw new Error('step must have run or uses')
        }
        steps.push(step as GHWorkflowStep)
    }
    return steps
}

function parseStepUsesActionValue(
    v: unknown,
    jobId: string,
    stepIndex: number,
): GHWorkflowActionSpecifier {
    if (!isString(v)) {
        throw new SchemaError({
            message: '`uses` must be a string',
            object: 'step',
            path: `jobs.${jobId}.steps[${stepIndex}].uses`,
        })
    }
    if (v.startsWith('docker://')) {
        return {
            __KIND: 'docker',
            uri: v,
        }
    }
    if (/^\.?\.\//.test(v)) {
        return {
            __KIND: 'filesystem',
            path: v,
        }
    }
    const action: Partial<GHWorkflowActionSpecifier> = {
        __KIND: 'repository',
    }
    const splitOnRef = v.split('@', 2)
    const splitPaths = splitOnRef[0].split('/')
    if (splitPaths.length < 2) {
        throw new SchemaError({
            message: 'Must be a resolvable GitHub Action',
            object: 'step',
            path: `jobs.${jobId}.steps[${stepIndex}].uses`,
        })
    }
    if (splitOnRef.length === 1) {
        throw new SchemaError({
            message: `Must specify GitHub Action ref in format \`${splitOnRef[0]}@{ref}\``,
            object: 'step',
            path: `jobs.${jobId}.steps[${stepIndex}].uses`,
        })
    } else {
        // todo regex validate ref
        action.ref = splitOnRef[1]
    }
    action.owner = splitPaths[0]
    action.repo = splitPaths[1]
    action.specifier = v
    if (splitPaths.length > 2) {
        action.subdirectory = splitPaths.splice(2).join('/')
    }
    return action as GHWorkflowActionSpecifier
}

function checkUnsupportedWorkflowKeys(
    wfYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
) {
    for (const k of Object.keys(wfYaml)) {
        switch (k) {
            case 'concurrency':
            case 'defaults':
            case 'env':
            case 'jobs':
            case 'name':
            case 'permissions':
            case 'on':
            case 'run-name':
                break
            default:
                schemaErrors.push({
                    message: `Workflow has an unsupported field \`${k}\``,
                    object: 'workflow',
                    path: k,
                })
        }
    }
}

function checkUnsupportedJobKeys(
    jobYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    jobId: string,
) {
    for (const k of Object.keys(jobYaml)) {
        switch (k) {
            case 'concurrency':
            case 'container':
            case 'continue-on-error':
            case 'env':
            case 'environment':
            case 'defaults':
            case 'if':
            case 'name':
            case 'needs':
            case 'outputs':
            case 'permissions':
            case 'runs-on':
            case 'secrets':
            case 'services':
            case 'strategy':
            case 'steps':
            case 'timeout-minutes':
            case 'uses':
            case 'with':
                break
            default:
                schemaErrors.push({
                    message: `Job \`${jobId}\` has an unsupported field \`${k}\``,
                    object: 'job',
                    path: `jobs.${jobId}.${k}`,
                })
        }
    }
}

function checkUnsupportedDefaultsKeys(
    defaultsYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    jobId?: string,
) {
    for (const k of Object.keys(defaultsYaml)) {
        switch (k) {
            case 'run':
                if (!isMap(defaultsYaml.run)) {
                    if (!!jobId) {
                        schemaErrors.push({
                            message:
                                'Must be an object of job run defaults config',
                            object: 'job',
                            path: `jobs.${jobId}.defaults`,
                        })
                    } else {
                        schemaErrors.push({
                            message:
                                'Must be an object of workflow run defaults config',
                            object: 'workflow',
                            path: 'defaults',
                        })
                    }
                } else {
                    for (const runK of Object.keys(defaultsYaml.run)) {
                        switch (runK) {
                            case 'shell':
                            case 'working-directory':
                                break
                            default:
                                if (!!jobId) {
                                    schemaErrors.push({
                                        message: `Job \`${jobId}\` defaults has an unsupported field \`run.${runK}\``,
                                        object: 'job',
                                        path: `jobs.${jobId}.defaults.run.${runK}`,
                                    })
                                } else {
                                    schemaErrors.push({
                                        message: `Workflow defaults has an unsupported field \`run.${runK}\``,
                                        object: 'workflow',
                                        path: `defaults.run.${runK}`,
                                    })
                                }
                        }
                    }
                }
                break
            default:
                if (!!jobId) {
                    schemaErrors.push({
                        message: `Job \`${jobId}\` defaults has an unsupported field \`${k}\``,
                        object: 'job',
                        path: `jobs.${jobId}.defaults.${k}`,
                    })
                } else {
                    schemaErrors.push({
                        message: `Workflow defaults has an unsupported field \`${k}\``,
                        object: 'workflow',
                        path: `defaults.${k}`,
                    })
                }
        }
    }
}

// used for job container and services
function checkUnsupportedJobContainerKeys(
    containerYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    jobId: string,
    serviceId?: string,
) {
    for (const k of Object.keys(containerYaml)) {
        switch (k) {
            case 'credentials':
            case 'env':
            case 'image':
            case 'options':
            case 'ports':
            case 'volumes':
                break
            default:
                if (!!serviceId) {
                    schemaErrors.push({
                        message: `Service \`${serviceId}\` of job \`${jobId}\` has an unsupported field \`${k}\``,
                        object: 'job',
                        path: `jobs.${jobId}.services.${serviceId}.${k}`,
                    })
                } else {
                    schemaErrors.push({
                        message: `Container of job \`${jobId}\` has an unsupported field \`${k}\``,
                        object: 'job',
                        path: `jobs.${jobId}.container.${k}`,
                    })
                }
        }
    }
}

function checkUnsupportedJobStrategyKeys(
    strategyYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    jobId: string,
) {
    for (const k of Object.keys(strategyYaml)) {
        switch (k) {
            case 'fail-fast':
            case 'matrix':
            case 'max-parallel':
                break
            default:
                schemaErrors.push({
                    message: `Strategy of job \`${jobId}\` has an unsupported field \`${k}\``,
                    object: 'job',
                    path: `jobs.${jobId}.strategy.${k}`,
                })
        }
    }
}

function checkUnsupportedJobStepKeys(
    stepYaml: Record<string, unknown>,
    schemaErrors: Array<GHWorkflowSchemaError>,
    jobId: string,
    stepIndex: number,
) {
    for (const k of Object.keys(stepYaml)) {
        switch (k) {
            case 'env':
            case 'continue-on-error':
            case 'id':
            case 'if':
            case 'name':
            case 'run':
            case 'shell':
            case 'timeout-minutes':
            case 'uses':
            case 'with':
            case 'working-directory':
                break
            default:
                schemaErrors.push({
                    message: `Step of job \`${jobId}\` has an unsupported field \`${k}\``,
                    object: 'step',
                    path: `jobs.${jobId}.steps[${stepIndex}].${k}`,
                })
        }
    }
}
