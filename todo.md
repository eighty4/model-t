# todos

- refactor YARML `parse` API to `Document` or `AST` to surface line/column info

## parse expressions

collect context references from

- jobs.<job_id>.env
- jobs.<job_id>.outputs
- jobs.<job_id>.with
- jobs.<job_id>.steps[*].env
- jobs.<job_id>.steps[*].run
- jobs.<job_id>.steps[*].with

from any expression

- inputs.\*
- secrets.\*

from any job expression

- needs.<job_id>.outputs.\*

from jobs.<job_id>.outputs

- steps.<step_id>.outputs.\*

from jobs.<job_id>.steps[*].run

- reading env vars $ASDF ${ASDF}
- writing to step outputs

## validation errors

### schema errors during yaml read

- strict validation of kv pairs within object (step with `run:` cannot have `with:`)
- error if `job.needs:` dependency graph is unresolvable

### expression errors

`${{ inputs.XYZ }}`

- error if workflow does not have `XYZ` input

`${{ needs.XYZ.outputs.ABC }}`

- error if `XYZ` is not in current job's `needs`
- error if `XYZ` does not declare an `ABC` output
- error if `XYZ` output `ABC` cannot be resolved as it is configured

### uses workflow errors

- error if workflow cannot be found
- error if workflow does not have `on: workflow_call:`
- error if workflow use has unmet input requirements

### uses github action errors

- error if action cannot be found
- error if action use has unmet input requirements
- warning if action is out of date
