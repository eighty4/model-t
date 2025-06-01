import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readWorkflowFromFile, readWorkflowFromString } from './readModel.ts'

describe('reading workflows', () => {
    describe('from file', () => {
        it('throws on !valid path', async () => {
            await assert.rejects(
                () => readWorkflowFromFile(42 as unknown as string),
                new Error('YAML path must be a string'),
            )
            await assert.rejects(
                () => readWorkflowFromFile(''),
                new Error('YAML path must be a string'),
            )
            await assert.rejects(
                () => readWorkflowFromFile('fixtures/bunk'),
                new Error('YAML file fixtures/bunk not found'),
            )
        })

        it('works', async () => {
            const result = await readWorkflowFromFile('fixtures/node_test.yml')
            assert.deepEqual(result.schemaErrors, [])
        })
    })

    describe('bad input', () => {
        it('throws error', () => {
            assert.throws(
                () => readWorkflowFromString('42'),
                new Error(
                    'This number YAML is simply the opportunity to begin again, this time with a valid workflow YAML',
                ),
            )
        })
    })

    describe('on:', () => {
        it('on: [events]', () => {
            const yaml = `
on: [pull_request, push]
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

            assert.deepEqual(readWorkflowFromString(yaml), {
                workflow: {
                    jobs: {
                        'some-job': {
                            __KIND: 'uses',
                            uses: './.github/workflows/verify.yml',
                        },
                    },
                    on: {
                        pull_request: {
                            __KIND: 'pull_request',
                        },
                        push: {
                            __KIND: 'push',
                        },
                    },
                },
                schemaErrors: [],
            })
        })

        it('on: !valid', () => {
            const yaml = `
on: bunk
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

            assert.deepEqual(readWorkflowFromString(yaml), {
                workflow: {
                    on: {},
                    jobs: {
                        'some-job': {
                            __KIND: 'uses',
                            uses: './.github/workflows/verify.yml',
                        },
                    },
                },
                schemaErrors: [
                    {
                        message:
                            'Must be an array or map of workflow triggering events',
                        object: 'workflow',
                        path: 'on',
                    },
                ],
            })
        })

        describe('on.<event_name> !valid', () => {
            it('event_name !valid', () => {
                const yaml = `
on:
  workflow_do:
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {
                            'some-job': {
                                __KIND: 'uses',
                                uses: './.github/workflows/verify.yml',
                            },
                        },
                    },
                    schemaErrors: [
                        {
                            message:
                                '`workflow_do` is not a valid workflow trigger event name',
                            object: 'event',
                            path: 'on.workflow_do',
                        },
                    ],
                })
            })
        })

        describe('on.workflow_call:', () => {
            describe('on.workflow_call.inputs:', () => {
                describe('inputs: !valid', () => {
                    it('inputs: !map !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs: bunk
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                    },
                                },
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a map of workflow inputs',
                                    object: 'event',
                                    path: 'on.workflow_call.inputs',
                                },
                            ],
                        })
                    })

                    it('inputs.<input_id>: !map !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      bunk: [input, config]
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message:
                                        'Must be a map of input configuration',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.bunk',
                                },
                            ],
                        })
                    })

                    it('inputs.<input_id>.type: !valid yaml type', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type:
          bunk: data
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a string',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data.type',
                                },
                            ],
                        })
                    })

                    it('inputs.<input_id>.type: !valid input type', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: bunk
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message:
                                        '`bunk` is not a valid workflow_call input type',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data.type',
                                },
                            ],
                        })
                    })

                    it('inputs.<input_id>: extra prop !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: boolean
        bonkers: not included
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message:
                                        '`happy_data` cannot have field `bonkers`',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data',
                                },
                            ],
                        })
                    })

                    it('inputs.<input_id>: extra props !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: boolean
        bonkers: not included
        bonanzas: upcharge
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message:
                                        '`happy_data` cannot have fields: `bonanzas`, `bonkers`',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data',
                                },
                            ],
                        })
                    })
                })

                describe('inputs.<input_id>.type: boolean', () => {
                    it('description: && required:', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: boolean
        description: no anomalies
        required: true
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {
                                            happy_data: {
                                                type: 'boolean',
                                                description: 'no anomalies',
                                                required: true,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: boolean', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: boolean
        default: true
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {
                                            happy_data: {
                                                type: 'boolean',
                                                default: true,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: !boolean !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: boolean
        default: booyah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a boolean',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data.default',
                                },
                            ],
                        })
                    })
                })

                describe('inputs.<input_id>.type: number', () => {
                    it('description: && required:', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: number
        description: no anomalies
        required: true
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {
                                            happy_data: {
                                                type: 'number',
                                                description: 'no anomalies',
                                                required: true,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: number', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: number
        default: 42
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {
                                            happy_data: {
                                                type: 'number',
                                                default: 42,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: !number !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: number
        default: booyah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a number',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data.default',
                                },
                            ],
                        })
                    })
                })

                describe('inputs.<input_id>.type: string', () => {
                    it('description: && required:', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: string
        description: no anomalies
        required: true
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {
                                            happy_data: {
                                                type: 'string',
                                                description: 'no anomalies',
                                                required: true,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: string', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: string
        default: anomalies
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {
                                            happy_data: {
                                                type: 'string',
                                                default: 'anomalies',
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: !string !valid', () => {
                        const yaml = `
on:
  workflow_call:
    inputs:
      happy_data:
        type: string
        default:
          boo: yah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_call: {
                                        __KIND: 'workflow_call',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a string',
                                    object: 'input',
                                    path: 'on.workflow_call.inputs.happy_data.default',
                                },
                            ],
                        })
                    })
                })
            })
        })

        describe('on.workflow_dispatch:', () => {
            describe('on.workflow_dispatch.inputs:', () => {
                it('supports the workflow_call inputs', () => {
                    const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_boolean:
        type: boolean
      happy_number:
        type: number
      happy_string:
        type: string
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                    const result = readWorkflowFromString(yaml)
                    assert.equal(
                        Object.keys(result.workflow.on.workflow_dispatch.inputs)
                            .length,
                        3,
                    )
                    assert.equal(result.schemaErrors.length, 0)
                })
            })

            describe('on.workflow_call.inputs', () => {
                describe('inputs.<input_id>.type: choice', () => {
                    it('description: && required:', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: choice
        options:
          - Boo
          - Yaa
        description: Boo before ya, except for Bu because Yabu
        required: true
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {
                                            happy_data: {
                                                type: 'choice',
                                                description:
                                                    'Boo before ya, except for Bu because Yabu',
                                                options: ['Boo', 'Yaa'],
                                                required: true,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('!options: !valid', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: choice
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Choice input must have `options`',
                                    object: 'input',
                                    path: 'on.workflow_dispatch.inputs.happy_data',
                                },
                            ],
                        })
                    })

                    it('options: !valid', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: choice
        options:
          boo: yah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be an array of strings',
                                    object: 'input',
                                    path: 'on.workflow_dispatch.inputs.happy_data.options',
                                },
                            ],
                        })
                    })

                    it('default: string', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: choice
        options:
          - Boo
          - Yaa
        default: Boo
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {
                                            happy_data: {
                                                type: 'choice',
                                                options: ['Boo', 'Yaa'],
                                                default: 'Boo',
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: !string !valid', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: choice
        options:
          - Boo
          - Yaa
        default:
          boo: yah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a string',
                                    object: 'input',
                                    path: 'on.workflow_dispatch.inputs.happy_data.default',
                                },
                            ],
                        })
                    })

                    it('default: !option', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: choice
        options:
          - Boo
          - Yaa
        default: Yah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: '`Yah` is not an input option',
                                    object: 'input',
                                    path: 'on.workflow_dispatch.inputs.happy_data.default',
                                },
                            ],
                        })
                    })
                })

                describe('inputs.<input_id>.type: environment', () => {
                    it('description: && required:', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: environment
        description: no anomalies
        required: true
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {
                                            happy_data: {
                                                type: 'environment',
                                                description: 'no anomalies',
                                                required: true,
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: string', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: environment
        default: prod
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {
                                            happy_data: {
                                                type: 'environment',
                                                default: 'prod',
                                            },
                                        },
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('default: !string !valid', () => {
                        const yaml = `
on:
  workflow_dispatch:
    inputs:
      happy_data:
        type: environment
        default:
          boo: yah
jobs:
  some-job:
    uses: ./.github/workflows/verify.yml`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                jobs: {
                                    'some-job': {
                                        __KIND: 'uses',
                                        uses: './.github/workflows/verify.yml',
                                    },
                                },
                                on: {
                                    workflow_dispatch: {
                                        __KIND: 'workflow_dispatch',
                                        inputs: {},
                                    },
                                },
                            },
                            schemaErrors: [
                                {
                                    message: 'Must be a string',
                                    object: 'input',
                                    path: 'on.workflow_dispatch.inputs.happy_data.default',
                                },
                            ],
                        })
                    })
                })
            })
        })
    })

    describe('jobs:', () => {
        describe('jobs.<job_id>: !valid', () => {
            it('job_id !valid', () => {
                const yaml = `
jobs:
  123bunk-id:
    uses: ./.github/workflows/verify.yml`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            message:
                                'Job id 123bunk-id must start with a letter or _ and only contain alphanumeric _ and -',
                            object: 'job',
                            path: 'jobs.123bunk-id',
                        },
                    ],
                })
            })

            it('. !map !valid', () => {
                const yaml = `
jobs:
  some-job: bunk data`
                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Cannot have a string value for a job',
                            object: 'job',
                            path: 'jobs.some-job',
                        },
                    ],
                })
            })

            it('.steps: && .uses: !valid', () => {
                const yaml = `
jobs:
  some-job:
    steps:
      - run: echo bunk
    uses: ./.github/workflows/verify.yml`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            message:
                                'Cannot define both `steps` and `uses` for a job',
                            object: 'job',
                            path: 'jobs.some-job',
                        },
                    ],
                })
            })

            it('!.steps: && !.uses: !valid', () => {
                const yaml = `
jobs:
  some-job:
    needs: verify`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Must define `steps` or `uses` for a job',
                            object: 'job',
                            path: 'jobs.some-job',
                        },
                    ],
                })
            })
        })

        describe('jobs.<job_id>.name', () => {
            it('.name: boolean | number | string', () => {
                ;[true, 42, 'chill'].forEach(name => {
                    const yaml = `
jobs:
  some-job:
    name: ${name}
    runs-on: ubuntu-latest
    steps:
      - run: ls`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'steps',
                                    name: `${name}`,
                                    runsOn: 'ubuntu-latest',
                                    steps: [
                                        {
                                            __KIND: 'run',
                                            run: 'ls',
                                        },
                                    ],
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })
            })

            it('.name: !valid', () => {
                const yaml = `
jobs:
  some-job:
    name:
      bad: data
    runs-on: ubuntu-latest
    steps:
      - run: ls`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            message: '`name` must be a string',
                            object: 'job',
                            path: 'jobs.some-job.name',
                        },
                    ],
                })
            })
        })

        describe('jobs.<job_id>.needs', () => {
            it('.needs: string', () => {
                const yaml = `
jobs:
  some-job:
    needs: verify
    uses: ./.github/workflows/another_workflow.yml`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {
                            'some-job': {
                                __KIND: 'uses',
                                needs: ['verify'],
                                uses: './.github/workflows/another_workflow.yml',
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('.needs: string[]', () => {
                const yaml = `
jobs:
  some-job:
    needs: [verify, check-params]
    uses: eighty4/l3/action`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {
                            'some-job': {
                                __KIND: 'uses',
                                needs: ['verify', 'check-params'],
                                uses: 'eighty4/l3/action',
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('.needs: !valid', () => {
                const yaml = `
jobs:
  some-job:
    needs:
      verify:
      check-params:
    uses: eighty4/l3/action`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            object: 'job',
                            path: 'jobs.some-job.needs',
                            message:
                                '`needs` must be a string or array of strings',
                        },
                    ],
                })
            })
        })

        describe('jobs.<job_id>.if', () => {
            it('.if: string', () => {
                const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/action
    if: inputs.doing-cool-devops == 'true'`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {
                            'some-job': {
                                __KIND: 'uses',
                                uses: 'eighty4/l3/action',
                                if: `inputs.doing-cool-devops == 'true'`,
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('.if: !valid', () => {
                const yaml = `
jobs:
  some-job:
    uses: ./.github/workflows/another_workflow.yml
    if:
      some-input:
        bunk: data`

                assert.deepEqual(readWorkflowFromString(yaml), {
                    workflow: {
                        on: {},
                        jobs: {},
                    },
                    schemaErrors: [
                        {
                            message: '`if` must be a string',
                            object: 'job',
                            path: 'jobs.some-job.if',
                        },
                    ],
                })
            })
        })

        describe('job calling workflow with `uses`', () => {
            describe('jobs.<job_id>.uses', () => {
                it('.uses: relative workflow', () => {
                    const yaml = `
jobs:
  some-job:
    uses: ./.github/workflows/another_workflow.yml`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'uses',
                                    uses: './.github/workflows/another_workflow.yml',
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.uses: external repo workflow', () => {
                    const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/.github/workflows/verify.yml`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'uses',
                                    uses: 'eighty4/l3/.github/workflows/verify.yml',
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.uses: external repo workflow with git ref', () => {
                    const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/.github/workflows/verify.yml@11bd39a781726e014747c47dbcb1b878050fc0e4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'uses',
                                    uses: 'eighty4/l3/.github/workflows/verify.yml@11bd39a781726e014747c47dbcb1b878050fc0e4',
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.uses: !valid', () => {
                    const yaml = `
jobs:
  some-job:
    uses:
      bunk: format`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message: '`uses` must be a string',
                                object: 'job',
                                path: 'jobs.some-job.uses',
                            },
                        ],
                    })
                })

                it('.uses: && .env: !valid', () => {
                    const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/.github/workflows/verify.yml
    env:
      bunk: cfg`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message: '`env` cannot be used with `uses`',
                                object: 'job',
                                path: 'jobs.some-job',
                            },
                        ],
                    })
                })
            })

            describe('jobs.<job_id>.with', () => {
                it('.with: {string: string}', () => {
                    const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/action
    with:
      some-input: asdf`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'uses',
                                    uses: 'eighty4/l3/action',
                                    with: {
                                        'some-input': 'asdf',
                                    },
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.with: {string: number}', () => {
                    const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/action
    with:
      some-input: 42`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'uses',
                                    uses: 'eighty4/l3/action',
                                    with: {
                                        'some-input': 42,
                                    },
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.with: {string: boolean}', () => {
                    const yaml = `
jobs:
  some-job:
    uses: eighty4/l3/action
    with:
      some-input: true`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'uses',
                                    uses: 'eighty4/l3/action',
                                    with: {
                                        'some-input': true,
                                    },
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.with: !valid', () => {
                    const yaml = `
jobs:
  some-job:
    uses: ./.github/workflows/another_workflow.yml
    with:
      some-input:
        bunk: data`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message:
                                    '`with` must be a map of booleans, numbers and strings',
                                object: 'job',
                                path: 'jobs.some-job.with',
                            },
                        ],
                    })
                })
            })
        })

        describe('job running steps on vm', () => {
            describe('jobs.<job_id>.steps:', () => {
                it('steps: !array !valid', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps: counter`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message:
                                    'Must be an array of step configurations',
                                object: 'job',
                                path: 'jobs.some-job.steps',
                            },
                        ],
                    })
                })
            })

            describe('jobs.<job_id>.env:', () => {
                it('.env: Record<string, string | boolean | number>', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    env:
      STR_VAL: settle and chill
      NUM_VAL: 42
      BOO_VAL: true
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'steps',
                                    runsOn: 'ubuntu-latest',
                                    env: {
                                        STR_VAL: 'settle and chill',
                                        NUM_VAL: '42',
                                        BOO_VAL: 'true',
                                    },
                                    steps: [
                                        {
                                            __KIND: 'uses',
                                            uses: 'actions/checkout@v4',
                                        },
                                    ],
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.env: !valid', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    env:
      STR_VAL:
        NUM_VAL: 42
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message: '`env` must be a map of strings',
                                object: 'job',
                                path: 'jobs.some-job.env',
                            },
                        ],
                    })
                })
            })

            describe('jobs.<job_id>.runs-on:', () => {
                it('.runs-on: string', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'steps',
                                    runsOn: 'ubuntu-latest',
                                    steps: [
                                        {
                                            __KIND: 'uses',
                                            uses: 'actions/checkout@v4',
                                        },
                                    ],
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.runs-on: string[]', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on: [self-hosted, linux, x64, gpu]
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'steps',
                                    runsOn: [
                                        'self-hosted',
                                        'linux',
                                        'x64',
                                        'gpu',
                                    ],
                                    steps: [
                                        {
                                            __KIND: 'uses',
                                            uses: 'actions/checkout@v4',
                                        },
                                    ],
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it(`.runs-on: {group: string, labels: string}`, () => {
                    const yaml = `
jobs:
  some-job:
    runs-on:
      group: ubuntu-runners
      labels: ubuntu-20
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'steps',
                                    runsOn: {
                                        group: 'ubuntu-runners',
                                        labels: ['ubuntu-20'],
                                    },
                                    steps: [
                                        {
                                            __KIND: 'uses',
                                            uses: 'actions/checkout@v4',
                                        },
                                    ],
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it(`.runs-on: {group: string, labels: Array<string>}`, () => {
                    const yaml = `
jobs:
  some-job:
    runs-on:
      group: ubuntu-runners
      labels: [linux, x64]
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {
                                'some-job': {
                                    __KIND: 'steps',
                                    runsOn: {
                                        group: 'ubuntu-runners',
                                        labels: ['linux', 'x64'],
                                    },
                                    steps: [
                                        {
                                            __KIND: 'uses',
                                            uses: 'actions/checkout@v4',
                                        },
                                    ],
                                },
                            },
                        },
                        schemaErrors: [],
                    })
                })

                it('.runs-on: {group} !valid', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on:
      group:
        bunk: data
      labels: linux
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message: 'Must be a string',
                                object: 'job',
                                path: 'jobs.some-job.runs-on.group',
                            },
                        ],
                    })
                })

                it('.runs-on: {labels} !valid', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on:
      group: ubuntu-runners
      labels:
        bunk: data
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message: 'Must be a string or array of strings',
                                object: 'job',
                                path: 'jobs.some-job.runs-on.labels',
                            },
                        ],
                    })
                })

                it('.runs-on: {extra} !valid', () => {
                    const yaml = `
jobs:
  some-job:
    runs-on:
      group: ubuntu-runners
      labels: [linux, x64]
      extra: bunk
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message:
                                    '`runs-on` must only have `group` and `labels` for querying runners',
                                object: 'job',
                                path: 'jobs.some-job.runs-on',
                            },
                        ],
                    })
                })

                it('.steps: && !.runs-on: !valid', () => {
                    const yaml = `
jobs:
  some-job:
    steps:
      - uses: actions/checkout@v4`

                    assert.deepEqual(readWorkflowFromString(yaml), {
                        workflow: {
                            on: {},
                            jobs: {},
                        },
                        schemaErrors: [
                            {
                                message:
                                    'Must be a runner image name, array of runner labels or map defining `group` and `labels`',
                                object: 'job',
                                path: 'jobs.some-job.runs-on',
                            },
                        ],
                    })
                })
            })

            describe('step using a github action with `uses`', () => {
                describe('jobs.<job_id>.steps[*].uses', () => {
                    it('.uses: && .env: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        env:
          BUNK: DATA`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message: '`env` cannot be used with `uses`',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0]',
                                },
                            ],
                        })
                    })

                    it('.uses: string', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/action`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'uses',
                                                uses: 'eighty4/l3/action',
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.uses: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    steps:
      - uses:
          bunk: data`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message: '`uses` must be a string',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].uses',
                                },
                            ],
                        })
                    })
                })

                describe('jobs.<job_id>.steps[*].with', () => {
                    it('.with: {string: string}', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/action
        with:
          some-input: asdf`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'uses',
                                                uses: 'eighty4/l3/action',
                                                with: {
                                                    'some-input': 'asdf',
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.with: {string: boolean}', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/action
        with:
          some-input: true`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'uses',
                                                uses: 'eighty4/l3/action',
                                                with: {
                                                    'some-input': true,
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.with: {string: number}', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/action
        with:
          some-input: 42`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'uses',
                                                uses: 'eighty4/l3/action',
                                                with: {
                                                    'some-input': 42,
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.with: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/action
        with:
          some-input:
            bunk: data`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message:
                                        '`with` must be a map of booleans, numbers and strings',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].with',
                                },
                            ],
                        })
                    })
                })
            })

            describe('step running a shell script with `run`', () => {
                describe('jobs.<job_id>.steps[*].env:', () => {
                    it('.env: Record<string, string | boolean | number>', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        env:
          STR_VAL: settle and chill
          NUM_VAL: 42
          BOO_VAL: true`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'run',
                                                run: 'ls',
                                                env: {
                                                    STR_VAL: 'settle and chill',
                                                    NUM_VAL: '42',
                                                    BOO_VAL: 'true',
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.env: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        env:
          STR_VAL:
            NUM_VAL: 42`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message: '`env` must be a map of strings',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].env',
                                },
                            ],
                        })
                    })
                })

                describe('jobs.<job_id>.steps[*].run', () => {
                    it('.run: string', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: echo asdf`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'run',
                                                run: 'echo asdf',
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.run: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    steps:
      - run:
          bunk: data`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message: '`run` must be a string',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].run',
                                },
                            ],
                        })
                    })
                })
            })

            describe('step props common to `run` and `uses`', () => {
                describe('jobs.<job_id>.steps[*].id', () => {
                    it('.id: string', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        id: asdf`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'run',
                                                run: 'ls',
                                                id: 'asdf',
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.id: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        id: -asdf`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message:
                                        'Step id -asdf must be a string starting with a letter or _ and only contain alphanumeric _ and -',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].id',
                                },
                            ],
                        })
                    })

                    it('.id: !string !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        id:
          bunk: data`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message:
                                        'Step id [object Object] must be a string starting with a letter or _ and only contain alphanumeric _ and -',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].id',
                                },
                            ],
                        })
                    })
                })

                describe('jobs.<job_id>.steps[*].if', () => {
                    it('.if: string', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - if: inputs.run-step == 'true'
        run: echo asdf`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'run',
                                                if: `inputs.run-step == 'true'`,
                                                run: 'echo asdf',
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.if: boolean', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - if: true
        run: echo asdf`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {
                                    'some-job': {
                                        __KIND: 'steps',
                                        runsOn: 'ubuntu-latest',
                                        steps: [
                                            {
                                                __KIND: 'run',
                                                if: 'true',
                                                run: 'echo asdf',
                                            },
                                        ],
                                    },
                                },
                            },
                            schemaErrors: [],
                        })
                    })

                    it('.if: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - if:
          jimmy: cracks corn
        run: echo bunk`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message: '`if` must be a string',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].if',
                                },
                            ],
                        })
                    })
                })

                describe('jobs.<job_id>.steps[*].name', () => {
                    it('.name: boolean | number | string', () => {
                        ;[true, 42, 'chill'].forEach(name => {
                            const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        name: ${name}`

                            assert.deepEqual(readWorkflowFromString(yaml), {
                                workflow: {
                                    on: {},
                                    jobs: {
                                        'some-job': {
                                            __KIND: 'steps',
                                            runsOn: 'ubuntu-latest',
                                            steps: [
                                                {
                                                    __KIND: 'run',
                                                    name: `${name}`,
                                                    run: 'ls',
                                                },
                                            ],
                                        },
                                    },
                                },
                                schemaErrors: [],
                            })
                        })
                    })

                    it('.name: !valid', () => {
                        const yaml = `
jobs:
  some-job:
    runs-on: ubuntu-latest
    steps:
      - run: ls
        name:
          bad: data`

                        assert.deepEqual(readWorkflowFromString(yaml), {
                            workflow: {
                                on: {},
                                jobs: {},
                            },
                            schemaErrors: [
                                {
                                    message: '`name` must be a string',
                                    object: 'step',
                                    path: 'jobs.some-job.steps[0].name',
                                },
                            ],
                        })
                    })
                })
            })
        })
    })
})
