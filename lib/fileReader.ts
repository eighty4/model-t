import {
    type FileFetcher,
    FileNotFoundError,
    GitHubApiNotFound,
    NetworkError,
    type RepoObjectFetcher,
} from './fileFetcher.ts'
import type {
    GHAction,
    GHWorkflow,
    GHWorkflowActionSpecifier,
    GHWorkflowCallSpecifier,
} from './model.ts'
import { readActionModel } from './readAction.ts'
import { readWorkflowModel } from './readWorkflow.ts'
import { GHWorkflowError } from './workflowError.ts'

type ReaderCache = {
    actions: CachedActions
    workflows: CachedWorkflows
}

type CachedActions = {
    repository: SchemaCache<GHAction>
}

type CachedWorkflows = {
    filesystem: SchemaCache<GHWorkflow>
    repository: SchemaCache<GHWorkflow>
}

type SchemaCache<T> = Record<string, Promise<T>>

function createReaderCache(): ReaderCache {
    return {
        actions: {
            repository: {},
        },
        workflows: {
            filesystem: {},
            repository: {},
        },
    }
}

export class FileReader {
    #cache: ReaderCache
    #files: FileFetcher
    #repoObjects: RepoObjectFetcher

    constructor(files: FileFetcher, repoObjects: RepoObjectFetcher) {
        this.#cache = createReaderCache()
        this.#files = files
        this.#repoObjects = repoObjects
    }

    async actionFromRepository(
        actionSpec: Extract<
            GHWorkflowActionSpecifier,
            { __KIND: 'repository' }
        >,
        referencedBy: GHWorkflow,
    ): Promise<GHAction> {
        const cache = this.#cache.actions.repository
        if (!cache[actionSpec.specifier]) {
            cache[actionSpec.specifier] = this.#readActionFromRepository(
                actionSpec,
                referencedBy,
            )
        }
        return await cache[actionSpec.specifier]
    }

    async workflowFromFilesystem(
        p: string,
        referencedBy?: GHWorkflow,
    ): Promise<GHWorkflow> {
        const cache = this.#cache.workflows.filesystem
        if (!cache[p]) {
            cache[p] = this.#readWorkflowFromFilesystem(p, referencedBy)
        }
        return await cache[p]
    }

    async workflowFromRepository(
        workflowSpec: Extract<
            GHWorkflowCallSpecifier,
            { __KIND: 'repository' }
        >,
        referencedBy: GHWorkflow,
    ): Promise<GHWorkflow> {
        const cache = this.#cache.workflows.repository
        if (!cache[workflowSpec.specifier]) {
            cache[workflowSpec.specifier] = this.#readWorkflowFromRepository(
                workflowSpec,
                referencedBy,
            )
        }
        return await cache[workflowSpec.specifier]
    }

    async #readActionFromRepository(
        actionSpec: Extract<
            GHWorkflowActionSpecifier,
            { __KIND: 'repository' }
        >,
        referencedBy: GHWorkflow,
    ): Promise<GHAction> {
        try {
            const { action, schemaErrors } = readActionModel(
                await this.#repoObjects.fetchActionMetadata(
                    actionSpec.owner,
                    actionSpec.repo,
                    actionSpec.ref,
                    actionSpec.subdirectory,
                ),
            )
            if (schemaErrors.length) {
                throw new GHWorkflowError(
                    'ACTION_SCHEMA',
                    referencedBy.__PATH!,
                    { action: actionSpec.specifier, schemaErrors },
                )
            } else {
                return action
            }
        } catch (e) {
            // todo handle NetworkError by validating locally and skipping
            //  validations of remote resources
            if (e instanceof GitHubApiNotFound || e instanceof NetworkError) {
                throw new GHWorkflowError(
                    'ACTION_NOT_FOUND',
                    referencedBy.__PATH!,
                    { action: actionSpec.specifier },
                )
            } else {
                throw e
            }
        }
    }

    async #readWorkflowFromFilesystem(
        p: string,
        referencedBy?: GHWorkflow,
    ): Promise<GHWorkflow> {
        try {
            const wfYaml = await this.#files.fetchFile(p)
            const { workflow, schemaErrors } = readWorkflowModel(wfYaml)
            if (schemaErrors.length) {
                throw new GHWorkflowError('WORKFLOW_SCHEMA', p, {
                    referencedBy: referencedBy?.__PATH,
                    schemaErrors,
                })
            } else {
                workflow.__PATH = p
                return workflow
            }
        } catch (e: unknown) {
            if (e instanceof FileNotFoundError) {
                throw new GHWorkflowError('WORKFLOW_NOT_FOUND', p, {
                    referencedBy: referencedBy?.__PATH,
                })
            } else {
                throw e
            }
        }
    }

    async #readWorkflowFromRepository(
        workflowSpec: {
            owner: string
            repo: string
            ref: string
            specifier: string
            filename: string
        },
        referencedBy: GHWorkflow,
    ): Promise<GHWorkflow> {
        try {
            const { workflow, schemaErrors } = readWorkflowModel(
                await this.#repoObjects.fetchFile(
                    workflowSpec.owner,
                    workflowSpec.repo,
                    workflowSpec.ref,
                    '.github/workflows/' + workflowSpec.filename,
                ),
            )
            if (schemaErrors.length) {
                throw new GHWorkflowError(
                    'WORKFLOW_SCHEMA',
                    workflowSpec.specifier,
                    {
                        referencedBy: referencedBy.__PATH!,
                        schemaErrors,
                    },
                )
            } else {
                return workflow
            }
        } catch (e: unknown) {
            // todo handle NetworkError by validating locally and skipping
            //  validations of remote resources
            if (e instanceof GitHubApiNotFound || e instanceof NetworkError) {
                throw new GHWorkflowError(
                    'WORKFLOW_NOT_FOUND',
                    workflowSpec.specifier,
                    {
                        referencedBy: referencedBy.__PATH!,
                    },
                )
            } else {
                throw e
            }
        }
    }
}
