import { readWorkflowFromFile } from './readModel.ts'

const args = [...process.argv]
while (!args.shift()?.endsWith('bin.ts')) {}

if (args.length !== 1) {
    console.log('model-t WORKFLOW_YAML')
    process.exit(1)
}

const { schemaErrors } = await readWorkflowFromFile(args[0])

if (schemaErrors.length) {
    console.log(schemaErrors.length, 'workflow schema errors')
    schemaErrors
        .map(({ message, path }) => `${path}: ${message}`)
        .forEach(console.log)
    process.exit(1)
}
