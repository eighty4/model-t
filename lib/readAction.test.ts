import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readActionModel } from './readAction.ts'

describe('reading actions', () => {
    describe('bad input', () => {
        it('throws error', () => {
            assert.throws(
                () => readActionModel('42'),
                new TypeError(
                    'This number YAML is simply the opportunity to begin again, this time with a valid workflow YAML',
                ),
            )
        })
    })

    describe('inputs:', () => {
        it('happy path', () => {
            const yaml = `
inputs:
  some-input:
    description: an input
    required: true
    default: default
`
            assert.deepEqual(readActionModel(yaml), {
                action: {
                    inputs: {
                        'some-input': {
                            description: 'an input',
                            required: true,
                            default: 'default',
                        },
                    },
                },
                schemaErrors: [],
            })
        })

        it('inputs: !map !valid', () => {
            const yaml = `
inputs: bunk
`
            assert.deepEqual(readActionModel(yaml), {
                action: {
                    inputs: {},
                },
                schemaErrors: [
                    {
                        message: 'Must be a map of inputs',
                        path: 'inputs',
                    },
                ],
            })
        })

        it('input.<input_id>: !map !valid', () => {
            const yaml = `
inputs:
  some-input:
`
            assert.deepEqual(readActionModel(yaml), {
                action: {
                    inputs: {},
                },
                schemaErrors: [
                    {
                        message: 'Must be a map of input properties',
                        path: 'inputs.some-input',
                    },
                ],
            })
        })

        describe('inputs.<input_id>.description:', () => {
            it('description: required !set !valid', () => {
                const yaml = `
inputs:
  some-input:
    required: true
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Field is required',
                            path: 'inputs.some-input.description',
                        },
                    ],
                })
            })

            it('description: !string !valid', () => {
                const yaml = `
inputs:
  some-input:
    description:
      bunk: data
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Must be a string',
                            path: 'inputs.some-input.description',
                        },
                    ],
                })
            })
        })

        describe('inputs.<input_id>.required:', () => {
            it('required: boolean valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    required: true
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {
                            'some-input': {
                                description: 'good',
                                required: true,
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('description: !boolean !valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    required: bunk
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Must be a boolean',
                            path: 'inputs.some-input.required',
                        },
                    ],
                })
            })
        })

        describe('inputs.<input_id>.default:', () => {
            it('default: null valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    default: null
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {
                            'some-input': {
                                description: 'good',
                                default: null,
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('default: string valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    default: good
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {
                            'some-input': {
                                description: 'good',
                                default: 'good',
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('default: !string !valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    default:
      bunk: data
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Must be a string or null',
                            path: 'inputs.some-input.default',
                        },
                    ],
                })
            })
        })

        describe('inputs.<input_id>.deprecationMessage:', () => {
            it('deprecationMessage: string valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    deprecationMessage: no longer good
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {
                            'some-input': {
                                description: 'good',
                                deprecationMessage: 'no longer good',
                            },
                        },
                    },
                    schemaErrors: [],
                })
            })

            it('deprecationMessage: !string !valid', () => {
                const yaml = `
inputs:
  some-input:
    description: good
    deprecationMessage:
        bunk: data
`
                assert.deepEqual(readActionModel(yaml), {
                    action: {
                        inputs: {},
                    },
                    schemaErrors: [
                        {
                            message: 'Must be a string',
                            path: 'inputs.some-input.deprecationMessage',
                        },
                    ],
                })
            })
        })
    })
})
