#!/usr/bin/env node

import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import {
    isFileNotFound,
    ProjectFileFetcher,
    RestFileFetcher,
} from './fileFetcher.ts'
import { GHWorkflowAnalyzer, GHWorkflowError } from './workflowAnalyzer.ts'

const args: Array<string> = (() => {
    const args = [...process.argv]
    let shifted: string | undefined
    while ((shifted = args.shift())) {
        if (
            typeof shifted === 'undefined' ||
            ['model-t', 'bin.ts', 'bin.js'].find(p => shifted?.endsWith(p))
        ) {
            break
        }
    }
    return args
})()

if (args.some(arg => arg === '-h' || arg === '--help') || args.length !== 1) {
    console.log(bold('model-t'), 'PROJECT_DIR|WORKFLOW_YAML')
    process.exit(1)
} else {
    await handlePathInput(args[0])
}

async function handlePathInput(p: string) {
    switch (await resolveStat(p)) {
        case 'absent':
            errorExit('path is not a file or directory')
        case 'dir':
            await handleDirPath(p)
            break
        case 'file':
            await handleFilePath(p)
            break
    }
}

async function resolveStat(p: string): Promise<'absent' | 'dir' | 'file'> {
    try {
        return (await stat(p)).isDirectory() ? 'dir' : 'file'
    } catch (e: unknown) {
        if (isFileNotFound(e)) {
            return 'absent'
        } else {
            throw e
        }
    }
}

async function isDirectory(p: string): Promise<boolean> {
    return (await resolveStat(p)) === 'dir'
}

// assert p is a project root with a .github/workflows dir and validate em all
async function handleDirPath(p: string) {
    const projectRoot = resolve(p)
    const workflowsPath = join(projectRoot, '.github', 'workflows')
    if (!(await isDirectory(workflowsPath))) {
        errorExit('directory does not have a .github/workflows directory')
    }
    const workflows = (await readdir(workflowsPath)).filter(
        p => p.endsWith('.yml') || p.endsWith('.yaml'),
    )
    if (!workflows.length) {
        errorExit('no workflows in .github/workflows directory')
    }
    for (const workflow of workflows) {
        await validateProjectWorkflow(projectRoot, workflow)
    }
}

// assert p is a workflow yml in a .github/workflows dir and validate it
async function handleFilePath(p: string) {
    if (!/ya?ml/.test(extname(p))) {
        errorExit('path is not a YAML file')
    }
    const projectRoot = walkUpPathToProjectRoot(p)
    await validateProjectWorkflow(projectRoot, basename(p))
}

// returns project root or errors if p is not a file in .github/workflows
function walkUpPathToProjectRoot(p: string): string {
    let projectRoot = resolve(dirname(p))
    if (basename(projectRoot) === 'workflows') {
        projectRoot = dirname(projectRoot)
        if (basename(projectRoot) === '.github') {
            return dirname(projectRoot)
        }
    }
    errorExit('path is not a workflow in a .github/workflows directory')
}

// given abs path to a project root and a workflow filename, validate
async function validateProjectWorkflow(projectRoot: string, workflow: string) {
    const files = new ProjectFileFetcher(projectRoot)
    const repoObjects = new RestFileFetcher()
    const workflowAnalyzer = new GHWorkflowAnalyzer(files, repoObjects)
    try {
        await workflowAnalyzer.analyzeWorkflow('.github/workflows/' + workflow)
        console.log(greenCheckMark(), workflow, 'is valid')
    } catch (e: unknown) {
        if (e instanceof GHWorkflowError) {
            workflowErrorExit(e)
        } else if (e instanceof Error) {
            console.log(redBooBoo(), workflow, 'error:', e.message)
        }
    }
}

function workflowErrorExit(e: GHWorkflowError) {
    const output = [redBooBoo()]
    if (e.code === 'FILE_NOT_FOUND') {
        output.push('could not find workflow')
    } else if (e.code === 'WORKFLOW_SCHEMA') {
        output.push('schema errors in workflow')
    }
    output.push(`\`${e.workflow}\``)
    if (e.referencedBy !== null) {
        output.push(`referenced by \`${e.referencedBy}\``)
    }
    console.log(...output)
    if (e.schemaErrors?.length) {
        for (const schemaError of e.schemaErrors) {
            console.log(`    ${redDash()} ${schemaError.message}`)
            console.log(`        ${greyText(schemaError.path)}`)
        }
    }
}

function bold(s: string): string {
    return `\u001b[1m${s}\u001b[0m`
}

function greenCheckMark(): string {
    return '\u001b[32m✔\u001b[0m'
}

function greyText(s: string): string {
    return `\u001b[90m${s}\u001b[0m`
}

function redBooBoo(): string {
    return '\u001b[31m✗\u001b[0m'
}

function redDash(): string {
    return '\u001b[31m-\u001b[0m'
}

function errorExit(msg: string): never {
    console.error(`\u001b[31merror:\u001b[0m ${msg}`)
    process.exit(1)
}
