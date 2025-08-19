export class FileNotFoundError extends Error {
    path: string
    constructor(path: string) {
        super(path + ' not found')
        this.name = this.constructor.name
        this.path = path
    }
}

// for reading project files
//
// path input will be relative to repository root such as
// `./.github/workflows/verify.yml`
export type FileFetcher = {
    fetchFile(p: string): Promise<string>
}
