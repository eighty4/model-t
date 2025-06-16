# model-t

> "Make the best quality goods possible"
>
> - Henry Ford'

The npm package `@eighty4/model-t` ships a CLI and APIs for validating GitHub
Actions workflows. Workflows are validated for schema and runtime behavior and
can be easily integrated into git hooks for immediate feedback.

## Validating workflows

```bash
# install with npm
npm i -g @eighty4/model-t

model-t -h

# validate a workflow
model-t .github/workflows/publish.yml

# validate all workflows in .github/workflows
model-t .
```

## Using with git hooks

### Validating on `git push`

Use this script as your push hook by writing it to `.git/hooks/pre-push`. Any
pushes with changes to your GitHub Workflows will run `model-t .` to validate
your updates.

```bash
#!/bin/sh
set -e

read -a _input
_changes=$(git diff --name-only ${_input[1]} ${_input[3]})
if echo "$_changes" | grep -Eq "^\.github/workflows/.*?\.ya?ml$"; then
    model-t .
fi
```

### Validating on `git commit`

This script at `.git/hooks/pre-commit` will check the output of `git status`
for changes to GitHub Workflows and run `model-t .` to validate your updates.

```bash
#!/bin/sh
set -e

_changes=$(git status)
if echo "$_changes" | grep -Eq "\.github/workflows/.*?\.ya?ml"; then
    model-t .
fi
```
