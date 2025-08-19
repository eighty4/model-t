import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type FileFetcher, FileNotFoundError } from './fileFetcher.ts'

export * from './fileFetcher.ts'

export function isFileNotFound(e: unknown): boolean {
    return (
        e !== null &&
        typeof e === 'object' &&
        'code' in e &&
        e.code === 'ENOENT'
    )
}

// throws FileNotFoundError
export class LocalFsFileFetcher implements FileFetcher {
    // absolute path to project root
    #projectRoot: string

    constructor(projectRoot: string) {
        this.#projectRoot = projectRoot
    }

    async fetchFile(p: string): Promise<string> {
        try {
            return await readFile(join(this.#projectRoot, p), 'utf-8')
        } catch (e: unknown) {
            if (isFileNotFound(e)) {
                throw new FileNotFoundError(p)
            } else {
                throw e
            }
        }
    }
}
