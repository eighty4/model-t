import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { FileReader } from './fileReader.ts'
import { GHWorkflowAnalyzer } from './workflowAnalyzer.ts'
import type { FileFetcher } from './fetchers/fileFetcher.ts'
import {
    GitHubApiNotFound,
    RepoObjectFetcher,
} from './fetchers/repoObjectFetcher.ts'

class TestFileFetcher implements FileFetcher {
    files: Record<string, string> = {}

    fetchFile(p: string): Promise<string> {
        const file = this.files[p.startsWith('./') ? p.substring(2) : p]
        if (!file) {
            throw new Error(p + ' not found in test files')
        }
        return Promise.resolve(file)
    }
}

class TestRepoObjectFetcher extends RepoObjectFetcher {
    objects: Record<string, string> = {}

    fetchFile(
        owner: string,
        repo: string,
        ref: string,
        p: string,
    ): Promise<string> {
        try {
            return Promise.resolve(this.objects[`${owner}${repo}${ref}${p}`])
        } catch (_e) {
            throw new GitHubApiNotFound()
        }
    }
}

describe('analyze workflow', () => {
    let files: TestFileFetcher
    let repoObjects: TestRepoObjectFetcher
    let reader: FileReader
    let analyzer: GHWorkflowAnalyzer

    beforeEach(() => {
        files = new TestFileFetcher()
        repoObjects = new TestRepoObjectFetcher()
        reader = new FileReader(files, repoObjects)
        analyzer = new GHWorkflowAnalyzer(reader)
    })

    function addFile(p: string, content: string) {
        files.files[p] = content
    }

    function addRepoObject(
        owner: string,
        repo: string,
        ref: string,
        p: string,
        content: string,
    ) {
        repoObjects.objects[`${owner}${repo}${ref}${p}`] = content
    }

    describe('job calls a project local workflow', () => {
        it('error `on.workflow_call` !present', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
`,
            )
            addFile(
                '.github/workflows/verify.yml',
                `
on:
  pull_request:
  push:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - run: echo verified
`,
            )

            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),
                (e: any) => {
                    assert.equal(e.code, 'WORKFLOW_RUNTIME')
                    assert.equal(
                        e.message,
                        `job \`verify\` using a workflow requires \`on.workflow_call:\` in the called workflow`,
                    )
                    return true
                },
            )
        })

        it('error `on.workflow_call.inputs` required && !with', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
`,
            )
            addFile(
                '.github/workflows/verify.yml',
                `
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
            )

            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),
                (e: any) => {
                    assert.equal(e.code, 'WORKFLOW_RUNTIME')
                    assert.equal(
                        e.message,
                        `input \`run_tests\` is required to call workflow from job \`verify\``,
                    )
                    return true
                },
            )
        })

        it('error `on.workflow_call.inputs` required boolean && with !boolean', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
    with:
      run_tests: frequent flyer miles
`,
            )
            addFile(
                '.github/workflows/verify.yml',
                `
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
            )

            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),
                (e: any) => {
                    assert.equal(e.code, 'WORKFLOW_RUNTIME')
                    assert.equal(
                        e.message,
                        `input \`run_tests\` is a \`boolean\` input and job \`verify\` cannot call workflow with a \`string\` value`,
                    )
                    return true
                },
            )
        })

        it('ok `on.workflow_call.inputs` required && with', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
    with:
      run_tests: true
`,
            )
            addFile(
                '.github/workflows/verify.yml',
                `
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
            )

            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })

        it('ok `on.workflow_call.inputs` required && default', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  workflow_dispatch:
jobs:
  verify:
    uses: ./.github/workflows/verify.yml
`,
            )
            addFile(
                '.github/workflows/verify.yml',
                `
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
            )
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })
    })

    describe('step calls a repository hosted action', () => {
        it('error action input required && !with', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  push:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/setup@v3
`,
            )
            addRepoObject(
                'eighty4',
                'l3',
                'v3',
                'setup/action.yml',
                `
inputs:
  must_set:
    description: mandatory
    required: true
`,
            )
            await assert.rejects(
                () => analyzer.analyzeWorkflow('.github/workflows/release.yml'),
                (e: any) => {
                    assert.equal(e.code, 'WORKFLOW_RUNTIME')
                    assert.equal(
                        e.message,
                        'input `must_set` is required to call action `eighty4/l3/setup@v3` from `step[0]` in job `verify`',
                    )
                    return true
                },
            )
        })

        it('ok action input required && with', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
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
            )
            addRepoObject(
                'eighty4',
                'l3',
                'v3',
                'setup/action.yml',
                `
inputs:
  must_set:
    description: mandatory
    required: true
`,
            )
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })

        it('ok action input required && default', async () => {
            addFile(
                '.github/workflows/release.yml',
                `
on:
  workflow_dispatch:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: eighty4/l3/setup@v3
`,
            )
            addRepoObject(
                'eighty4',
                'l3',
                'v3',
                'setup/action.yml',
                `
inputs:
  must_set:
    description: mandatory
    required: true
    default: congrats
`,
            )
            await analyzer.analyzeWorkflow('.github/workflows/release.yml')
        })
    })
})
