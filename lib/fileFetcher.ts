import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export class GHWorkflowFileNotFoundError extends Error {
    path: string
    constructor(path: string) {
        super(path + ' not found')
        this.name = this.constructor.name
        this.path = path
    }
}

// interface to abstract reading workflow files in a consistent manner
// whether working against a local filesystem or GitHub's GraphQL API
//
// path input will be relative to repository root such as
// `./.github/workflows/verify.yml`
export type FileFetcher = {
    fetchFile(p: string): Promise<string>
}

// fs project file fetcher
export class ProjectFileFetcher implements FileFetcher {
    // absolute path to project root
    #projectRoot: string

    constructor(projectRoot: string) {
        this.#projectRoot = projectRoot
    }

    async fetchFile(p: string): Promise<string> {
        try {
            return readFile(join(this.#projectRoot, p), 'utf-8')
        } catch (e: unknown) {
            if (
                e !== null &&
                typeof e === 'object' &&
                'code' in e &&
                e.code === 'ENOENT'
            ) {
                throw new GHWorkflowFileNotFoundError(p)
            } else {
                throw e
            }
        }
    }
}
