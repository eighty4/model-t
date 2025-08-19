export class GitHubApiNotFound extends Error {
    constructor() {
        super('gh api not found')
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

export class NetworkError extends Error {
    constructor(cause: unknown) {
        super('network error', { cause })
        this.name = this.constructor.name
    }
}

// for fetching over the network from a GitHub repository
//
// used to retrieve sources from external repos,
// workflows and action metadata files
//
// these errors are thrown by RepoObjectFetcher subclasses:
// throws GitHubApiNotFound
// throws GitHubApiRateLimited
// throws GitHubApiUnauthorized
// throws NetworkError
export abstract class RepoObjectFetcher {
    abstract fetchFile(
        owner: string,
        repo: string,
        ref: string,
        p: string,
    ): Promise<string>

    // retries `action.yaml` when `action.yml` not found
    async fetchActionMetadata(
        owner: string,
        repo: string,
        ref: string,
        subdir?: string,
    ): Promise<string> {
        let p = 'action.yml'
        if (typeof subdir !== 'undefined') {
            p = `${subdir}${subdir.endsWith('/') ? '' : '/'}${p}`
        }
        try {
            return await this.fetchFile(owner, repo, ref, p)
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

export class GraphQLObjectFetcher extends RepoObjectFetcher {
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
        const response = await fetchInner(
            'https://api.github.com/graphql',
            'POST',
            headers,
            JSON.stringify({ query }),
        )
        checkApiResponseErrors(response)
        const json = await response.json()
        const source = json.data.repository?.object?.text
        if (!source) {
            throw new GitHubApiNotFound()
        }
        return source
    }
}

// allows accessing public repo sources without auth token
// unauthorized requests have much stricter rate limiting quotas
export class RestApiObjectFetcher extends RepoObjectFetcher {
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
        const response = await fetchInner(url, 'GET', headers)
        checkApiResponseErrors(response)
        return await response.text()
    }
}

async function fetchInner(
    url: string,
    method: string,
    headers: Headers,
    body?: string,
): Promise<Response> | never {
    try {
        return await fetch(url, { method, headers, body })
    } catch (e: unknown) {
        throw new NetworkError(e)
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
