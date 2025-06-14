import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function isFileNotFound(e: unknown): boolean {
    return (
        e !== null &&
        typeof e === 'object' &&
        'code' in e &&
        e.code === 'ENOENT'
    )
}

export class FileNotFoundError extends Error {
    path: string
    constructor(path: string) {
        super(path + ' not found')
        this.name = this.constructor.name
        this.path = path
    }
}

export class GitHubApiNotFound extends Error {
    constructor() {
        super('gh api not found')
        this.name = this.constructor.name
    }
}

export class GitHubApiRateLimited extends Error {
    resetsWhen: Date

    constructor(resetsWhenSeconds: number) {
        super('gh api rate limited')
        this.name = this.constructor.name
        this.resetsWhen = new Date(resetsWhenSeconds * 1000)
    }
}

export class GitHubApiUnauthorized extends Error {
    constructor() {
        super('gh api unauthorized')
        this.name = this.constructor.name
    }
}

// for reading project files
//
// path input will be relative to repository root such as
// `./.github/workflows/verify.yml`
export type FileFetcher = {
    fetchFile(p: string): Promise<string>
}

export class ProjectFileFetcher implements FileFetcher {
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

function checkApiResponseErrors(response: Response): void | never {
    let rateLimited = false
    if (response.status === 401) {
        throw new GitHubApiUnauthorized()
    } else if (
        response.status === 403 &&
        response.headers.get('x-ratelimit-remaining') === '0'
    ) {
        rateLimited = true
    } else if (response.status === 429) {
        rateLimited = true
    } else if (response.status === 404) {
        throw new GitHubApiNotFound()
    }
    if (rateLimited) {
        throw new GitHubApiRateLimited(
            parseInt(response.headers.get('x-ratelimit-reset')!, 10),
        )
    } else if (response.status > 299) {
        throw new Error('gh api unexpected status ' + response.status)
    }
}

// for fetching from a GitHub repository used to retrieve external
// workflows and actions
export abstract class RepoObjectFetcher {
    abstract fetchFile(
        owner: string,
        repo: string,
        ref: string,
        p: string,
    ): Promise<string>

    async fetchActionMetadata(
        owner: string,
        repo: string,
        ref?: string,
        subdir?: string,
    ): Promise<string> {
        ref = ref || 'HEAD'
        let p = 'action.yml'
        if (typeof subdir !== 'undefined') {
            p = `${subdir}${subdir.endsWith('/') ? '' : '/'}${p}`
        }
        try {
            return this.fetchFile(owner, repo, ref, p)
        } catch (e: unknown) {
            if (e instanceof GitHubApiNotFound) {
                return this.fetchFile(
                    owner,
                    repo,
                    ref,
                    p.replace(/\.yml$/, '.yaml'),
                )
            } else {
                throw e
            }
        }
    }
}

export class GraphQLFetcher extends RepoObjectFetcher {
    #gitHubToken: string

    constructor(gitHubToken: string) {
        super()
        if (!gitHubToken) {
            throw new TypeError('gh token is required')
        }
        this.#gitHubToken = gitHubToken
    }

    async fetchFile(
        owner: string,
        repo: string,
        ref: string,
        p: string,
    ): Promise<string> {
        const query = `
query {
  repository(owner: "${owner}", name: "${repo}") {
    object(expression: "${ref}:${p}") {
      ... on Blob {
        text
      }
    }
  }
}`
        const headers = new Headers({
            authorization: 'Bearer ' + this.#gitHubToken,
            'content-type': 'application/json',
        })
        const response = await fetch('https://api.github.com/graphql', {
            method: 'POST',
            headers,
            body: JSON.stringify({ query }),
        })
        checkApiResponseErrors(response)
        const json = await response.json()
        const source = json.data.repository?.object?.text
        if (!source) {
            throw new GitHubApiNotFound()
        }
        return source
    }
}

export class RestFileFetcher extends RepoObjectFetcher {
    #gitHubToken?: string

    constructor(gitHubToken?: string) {
        super()
        this.#gitHubToken = gitHubToken
    }

    async fetchFile(
        owner: string,
        repo: string,
        ref: string,
        p: string,
    ): Promise<string> {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${ref}`
        const headers = new Headers({
            accept: 'application/vnd.github.v3.raw',
        })
        if (!!this.#gitHubToken) {
            headers.set('authorization', 'Bearer ' + this.#gitHubToken)
        }
        const response = await fetch(url, { headers })
        checkApiResponseErrors(response)
        return await response.text()
    }
}
