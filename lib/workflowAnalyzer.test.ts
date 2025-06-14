import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
    type FileFetcher,
    GitHubApiNotFound,
    RepoObjectFetcher,
} from './fileFetcher.ts'
import { GHWorkflowAnalyzer } from './workflowAnalyzer.ts'

class TestFileFetcher implements FileFetcher {
    files: Record<string, string>
    constructor(files: Record<string, string>) {
        this.files = files
    }
    fetchFile(p: string): Promise<string> {
        const file = this.files[p.startsWith('./') ? p.substring(2) : p]
        if (!file) {
            throw new Error(p + ' not found in test files')
        }
        return Promise.resolve(file)
    }
}

class TestRepoObjectFetcher extends RepoObjectFetcher {
    objects: Record<string, Record<string, Record<string, string>>>
    constructor(
        objects: Record<string, Record<string, Record<string, string>>>,
    ) {
        super()
        this.objects = objects
    }
    fetchFile(
        owner: string,
        repo: string,
        ref: string,
        p: string,
    ): Promise<string> {
        try {
            return Promise.resolve(this.objects[owner][repo][ref][p])
        } catch (_e) {
            throw new GitHubApiNotFound()
        }
    }
}

describe('analyze workflow', () => {
    describe('job calls a project local workflow', () => {
        it('error `on.workflow_call` !present', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
`,
                '.github/workflows/verify.yml': `
on:
  pull_request:
  push:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`,
            })

            const analyzer = new GHWorkflowAnalyzer(files)
            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),
                new Error(
                    `job \`verify\` using a workflow requires \`on.workflow_call:\` in the called workflow`,
                ),
            )
        })

        it('error `on.workflow_call.inputs` required && !with', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
`,
                '.github/workflows/verify.yml': `
on:
  workflow_call:
    inputs:
      run_tests:
        type: boolean
        required: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`,
            })
            const analyzer = new GHWorkflowAnalyzer(files)
            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),

                new Error(
                    `input \`run_tests\` is required to call workflow from job \`verify\``,
                ),
            )
        })

        it('error `on.workflow_call.inputs` required boolean && with !boolean', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
    with:
      run_tests: frequent flyer miles
`,
                '.github/workflows/verify.yml': `
on:
  workflow_call:
    inputs:
      run_tests:
        type: boolean
        required: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`,
            })
            const analyzer = new GHWorkflowAnalyzer(files)
            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),

                new Error(
                    `input \`run_tests\` is a \`boolean\` input and job \`verify\` cannot call workflow with a \`string\` value`,
                ),
            )
        })

        it('ok `on.workflow_call.inputs` required && with', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
    with:
      run_tests: true
`,
                '.github/workflows/verify.yml': `
on:
  workflow_call:
    inputs:
      run_tests:
        type: boolean
        required: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`,
            })

            const analyzer = new GHWorkflowAnalyzer(files)
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })

        it('ok `on.workflow_call.inputs` required && default', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
`,
                '.github/workflows/verify.yml': `
on:
  workflow_call:
    inputs:
      run_tests:
        type: boolean
        required: true
        default: true
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`,
            })

            const analyzer = new GHWorkflowAnalyzer(files)
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })
    })

    describe('step calls a repository hosted action', () => {
        it('error action input required && !with', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  push:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/setup@v3
`,
            })
            const objects = new TestRepoObjectFetcher({
                eighty4: {
                    l3: {
                        v3: {
                            'setup/action.yml': `
inputs:
  must_set:
    description: mandatory
    required: true
`,
                        },
                    },
                },
            })
            const analyzer = new GHWorkflowAnalyzer(files, objects)
            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),
                new Error(
                    'input `must_set` is required to call action `eighty4/l3/setup@v3` from `step[0]` in job `verify`',
                ),
            )
        })

        it('ok action input required && with', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/setup@v3
        with:
          must_set: congrats
`,
            })
            const objects = new TestRepoObjectFetcher({
                eighty4: {
                    l3: {
                        v3: {
                            'setup/action.yml': `
inputs:
  must_set:
    description: mandatory
    required: true
`,
                        },
                    },
                },
            })
            const analyzer = new GHWorkflowAnalyzer(files, objects)
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })

        it('ok action input required && default', async () => {
            const files = new TestFileFetcher({
                '.github/workflows/release.yml': `
on:
  workflow_dispatch:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/setup@v3
`,
            })
            const objects = new TestRepoObjectFetcher({
                eighty4: {
                    l3: {
                        v3: {
                            'setup/action.yml': `
inputs:
  must_set:
    description: mandatory
    required: true
    default: congrats
`,
                        },
                    },
                },
            })
            const analyzer = new GHWorkflowAnalyzer(files, objects)
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })
    })
})
