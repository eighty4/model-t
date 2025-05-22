import { readFile } from 'node:fs/promises'
import { parse as parseYaml } from 'yaml'
import type {
    GHWorkflow,
    GHWorkflowJob,
    GHWorkflowJobRunsSteps,
    GHWorkflowJobUsesWorkflow,
    GHWorkflowStep,
    GHWorkflowStepRunsShell,
    GHWorkflowStepUsesAction,
} from './model.ts'

const jobAndStepIdRegex = /^[_a-z]{1}[_\-a-z\d]+$/

const UNSUPPORTED_PROPS = Object.freeze({
    JOB_WITH_USES: ['env'],
    JOB_WITH_STEPS: [],
    STEP_WITH_USES: ['env'],
    STEP_WITH_RUN: [],
})

export type GHWorkflowSchemaError = {
    object: 'workflow' | 'input' | 'job' | 'step'
    path: string
    message: string
}

export type GHWorkflowParseResult = {
    workflow: GHWorkflow
    schemaErrors: Array<GHWorkflowSchemaError>
}

export async function readWorkflowFromFile(
    p: string,
): Promise<GHWorkflowParseResult> {
    if (typeof p !== 'string' || !p.length) {
        throw new Error('YAML path must be a string')
    }
    let yaml: string
    try {
        yaml = await readFile(p, 'utf-8')
    } catch (e: unknown) {
        if (
            e !== null &&
            typeof e === 'object' &&
            'code' in e &&
            e.code === 'ENOENT'
        ) {
            throw new Error(`YAML file ${p} not found`)
        } else {
            throw e
        }
    }
    return readWorkflowFromString(yaml)
}

export function readWorkflowFromString(s: string): GHWorkflowParseResult {
    if (typeof s !== 'string' || !s.length) {
        throw new Error('YAML input must be a string')
    }
    const wfYaml: unknown = parseYaml(s)
    if (!isMap(wfYaml)) {
        throw new Error(
            `This ${typeof wfYaml} YAML is simply the opportunity to begin again, this time with a valid workflow YAML`,
        )
    }
    const schemaErrors: Array<GHWorkflowSchemaError> = []
    const jobs = collectJobs(wfYaml, schemaErrors)
    return {
        workflow: {
            jobs,
        },
        schemaErrors,
    }
}

function collectJobs(
    wfYaml: Record<string, unknown>,
    errors: Array<GHWorkflowSchemaError>,
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
        errors.push({
            object: 'workflow',
            message: 'Type of jobs is incorrect at `jobs`',
            path: 'jobs',
        })
    }
    if (missingData) {
        errors.push({
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
        if (!jobAndStepIdRegex.test(jobId)) {
            errors.push({
                message: `Job id ${jobId} must start with a letter or _ and only contain alphanumeric _ and -`,
                object: 'job',
                path: `jobs.${jobId}`,
            })
            continue
        }
        if (!isMap(jobYaml)) {
            errors.push({
                object: 'job',
                message: `Cannot have a ${typeof jobYaml} value for a job`,
                path: `jobs.${jobId}`,
            })
            continue
        }
        const job: Partial<GHWorkflowJob> = {}
        if ('steps' in jobYaml && 'uses' in jobYaml) {
            errors.push({
                message: 'Cannot define both `steps` and `uses` for a job',
                object: 'job',
                path: `jobs.${jobId}`,
            })
            continue
        } else if ('steps' in jobYaml) {
            const stepsJob = job as Partial<GHWorkflowJobRunsSteps>
            stepsJob.__KIND = 'steps'
            if (isArrayOfMaps(jobYaml.steps)) {
                const steps = collectSteps(jobId, jobYaml.steps, errors)
                if (steps) {
                    stepsJob.steps = steps
                } else {
                    continue
                }
            } else {
                throw new Error('todo invalid job.steps')
            }
            if ('env' in jobYaml) {
                if (isMapOfStringLikes(jobYaml.env)) {
                    stepsJob.env = convertMapOfStringLikes(jobYaml.env)
                } else {
                    errors.push({
                        message: '`env` must be a map of strings',
                        object: 'job',
                        path: `jobs.${jobId}.env`,
                    })
                    continue
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
                            errors.push({
                                message: 'Must be a string',
                                object: 'job',
                                path: `jobs.${jobId}.runs-on.group`,
                            })
                            continue
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
                                errors.push({
                                    message:
                                        'Must be a string or array of strings',
                                    object: 'job',
                                    path: `jobs.${jobId}.runs-on.labels`,
                                })
                                continue
                            }
                        }
                    } else {
                        errors.push({
                            message:
                                '`runs-on` must only have `group` and `labels` for querying runners',
                            object: 'job',
                            path: `jobs.${jobId}.runs-on`,
                        })
                        continue
                    }
                }
            }
            if (!stepsJob.runsOn) {
                errors.push({
                    message:
                        'Must be a runner image name, array of runner labels or map defining `group` and `labels`',
                    object: 'job',
                    path: `jobs.${jobId}.runs-on`,
                })
                continue
            }
        } else if ('uses' in jobYaml) {
            const usesJob = job as Partial<GHWorkflowJobUsesWorkflow>
            usesJob.__KIND = 'uses'
            if (isString(jobYaml.uses)) {
                usesJob.uses = jobYaml.uses
            } else {
                errors.push({
                    object: 'job',
                    message: '`uses` must be a string',
                    path: `jobs.${jobId}.uses`,
                })
                continue
            }
            if ('with' in jobYaml) {
                if (isMapOfStrings(jobYaml.with)) {
                    usesJob.with = jobYaml.with
                } else {
                    errors.push({
                        object: 'job',
                        message: '`with` must be a map of strings',
                        path: `jobs.${jobId}.with`,
                    })
                    continue
                }
            }
            const unsupported = UNSUPPORTED_PROPS.JOB_WITH_USES.filter(
                unsupported => unsupported in jobYaml,
            )
            if (unsupported.length) {
                unsupported.forEach(u =>
                    errors.push({
                        message: `\`${u}\` cannot be used with \`uses\``,
                        object: 'job',
                        path: `jobs.${jobId}.${u}`,
                    }),
                )
                continue
            }
        } else {
            errors.push({
                message: 'Must define `steps` or `uses` for a job',
                object: 'job',
                path: `jobs.${jobId}`,
            })
            continue
        }
        if ('if' in jobYaml) {
            if (isStringLike(jobYaml.if)) {
                job.if = convertStringLike(jobYaml.if)
            } else {
                errors.push({
                    message: '`if` must be a string',
                    object: 'job',
                    path: `jobs.${jobId}.if`,
                })
                continue
            }
        }
        if ('name' in jobYaml) {
            if (isStringLike(jobYaml.name)) {
                job.name = convertStringLike(jobYaml.name)
            } else {
                errors.push({
                    message: '`name` must be a string',
                    object: 'job',
                    path: `jobs.${jobId}.name`,
                })
                continue
            }
        }
        if ('needs' in jobYaml) {
            if (isStringLike(jobYaml.needs)) {
                job.needs = [convertStringLike(jobYaml.needs)]
            } else if (isArrayOfStringLikes(jobYaml.needs)) {
                job.needs = jobYaml.needs.map(convertStringLike)
            } else {
                errors.push({
                    message: '`needs` must be a string or array of strings',
                    object: 'job',
                    path: `jobs.${jobId}.needs`,
                })
                continue
            }
        }
        jobs[jobId] = job as GHWorkflowJob
    }
    return jobs
}

function collectSteps(
    jobId: string,
    stepsYaml: Array<Record<string, unknown>>,
    errors: Array<GHWorkflowSchemaError>,
): Array<GHWorkflowStep> | undefined {
    const steps: Array<GHWorkflowStep> = []
    for (const [i, stepYaml] of stepsYaml.entries()) {
        const step: Partial<GHWorkflowStep> = {}
        if ('id' in stepYaml) {
            if (isString(stepYaml.id) && jobAndStepIdRegex.test(stepYaml.id)) {
                step.id = stepYaml.id
            } else {
                errors.push({
                    message: `Step id ${stepYaml.id} must be a string starting with a letter or _ and only contain alphanumeric _ and -`,
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].id`,
                })
                return
            }
        }
        if ('if' in stepYaml) {
            if (isStringLike(stepYaml.if)) {
                step.if = convertStringLike(stepYaml.if)
            } else {
                errors.push({
                    message: '`if` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].if`,
                })
                return
            }
        }
        if ('name' in stepYaml) {
            if (isStringLike(stepYaml.name)) {
                step.name = convertStringLike(stepYaml.name)
            } else {
                errors.push({
                    message: '`name` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].name`,
                })
                return
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
                errors.push({
                    message: '`run` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].run`,
                })
                return
            }
            if ('env' in stepYaml) {
                if (isMapOfStringLikes(stepYaml.env)) {
                    runStep.env = convertMapOfStringLikes(stepYaml.env)
                } else {
                    errors.push({
                        message: '`env` must be a map of strings',
                        object: 'step',
                        path: `jobs.${jobId}.steps[${i}].env`,
                    })
                    return
                }
            }
        } else if ('uses' in stepYaml) {
            const usesStep = step as Partial<GHWorkflowStepUsesAction>
            usesStep.__KIND = 'uses'
            if (isString(stepYaml.uses)) {
                usesStep.uses = stepYaml.uses
            } else {
                errors.push({
                    message: '`uses` must be a string',
                    object: 'step',
                    path: `jobs.${jobId}.steps[${i}].uses`,
                })
                return
            }
            const unsupported = UNSUPPORTED_PROPS.STEP_WITH_USES.filter(
                unsupported => unsupported in stepYaml,
            )
            if (unsupported.length) {
                unsupported.forEach(u =>
                    errors.push({
                        message: `\`${u}\` cannot be used with \`uses\``,
                        object: 'step',
                        path: `jobs.${jobId}.steps[${i}].${u}`,
                    }),
                )
                return
            }
        } else {
            throw new Error('step must have run or uses')
        }
        steps.push(step as GHWorkflowStep)
    }
    return steps
}

function convertMapOfStringLikes(
    c: Record<string, boolean | number | string>,
): Record<string, string> {
    const m: Record<string, string> = {}
    for (const [k, v] of Object.entries(c)) {
        m[k] = convertStringLike(v)
    }
    return m
}

function convertStringLike(c: boolean | number | string): string {
    return isString(c) ? c : `${c}`
}

function isArrayOfMaps(v: unknown): v is Array<Record<string, unknown>> {
    return Array.isArray(v) && v.every(isMap)
}

function isArrayOfStringLikes(
    v: unknown,
): v is Array<boolean | number | string> {
    return Array.isArray(v) && v.every(isStringLike)
}

function isArrayOfStrings(v: unknown): v is Array<string> {
    return Array.isArray(v) && v.every(isString)
}

function isBoolean(v: unknown): v is boolean {
    return typeof v === 'boolean'
}

function isMap(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isMapOfStringLikes(
    v: unknown,
): v is Record<string, boolean | number | string> {
    return isMap(v) && Object.values(v).every(isStringLike)
}

function isMapOfStrings(v: unknown): v is Record<string, string> {
    return isMap(v) && Object.values(v).every(isString)
}

function isNumber(v: unknown): v is number {
    return typeof v === 'number'
}

function isString(v: unknown): v is string {
    return typeof v === 'string'
}

function isStringLike(v: unknown): v is string | number | boolean {
    return isString(v) || isBoolean(v) || isNumber(v)
}
